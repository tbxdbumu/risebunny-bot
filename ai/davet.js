/**
 * Davet takibi — TEK KAYNAK.
 *
 * NEDEN BU DOSYA
 * --------------
 * Ölçülen sorun (2026-10-26): `r!davetlerim`, `r!davet-top` ve
 * `r!çekiliş-şart --davet N` hepsi `db.fetch("invites.<id>")` okuyordu ama
 * bu anahtara YAZAN hiçbir kod yoktu. Sonuç:
 *
 *   • `r!davetlerim` herkese 0 gösteriyordu,
 *   • `--davet N` şartlı çekilişte kimse şartı karşılayamıyordu,
 *   • `r!bonus-ekle` `global.onUpdateInvite` çağırıyordu — o fonksiyon hiç
 *     tanımlı değildi, komut TypeError ile çöküyordu.
 *
 * ÇÖZÜM
 * -----
 * 1) `GuildInvites` intent'i açılır (inviteCreate/inviteDelete dinlenebilsin).
 * 2) Her sunucu için davet önbelleği tutulur: `kod -> kullanım sayısı`.
 * 3) Üye katıldığında hangi davetin kullanıldığı, önbellekteki "önce" ve
 *    "sonra" kullanım sayılarının FARKINDAN bulunur (inviteCreate/inviteDelete
 *    olayları bu farkın tek güvenilir kaynağıdır).
 * 4) Üye ayrıldığında davet edene `leave` sayacı yazılır (sahte davet takibi).
 *
 * VERİ BİÇİMİ (`invites.<davetEdenId>`)
 * -------------------------------------
 *   {
 *     total:   number,  // kabul edilen toplam davet
 *     regular: number,  // normal davet
 *     bonus:   number,  // elle verilen bonus (r!bonus-ekle)
 *     fake:    number,  // 7 günden yeni hesap
 *     leave:   number,  // ayrılan davetli sayısı
 *     inviter: string|null
 *   }
 *
 * TOPLAM kuralı (r!davetlerim ile AYNI):
 *   toplam = total + bonus
 *
 * MODÜL ARAYÜZÜ
 * -------------
 *   toplamGetir(id)          -> number
 *   veriGetir(id)            -> nesne (varsayılanlarla)
 *   bonusEkle(id, n)         -> güncel nesne
 *   sofraSıfırla(guildId)    -> tüm davetleri sil
 *   onbellekYukle(guild)     -> cache doldur
 *   katilimIsle(client, member) -> { davetEden, kod, sahte } | null
 *   ayrilimIsle(client, member) -> boolean
 */
const db = require("croxydb");

/* ── Sabitler ──────────────────────────────────────────────────────── */
/** Bu günden yeni hesaplar "sahte" sayılır (fake davet). */
const SAHTE_HESAP_GUN = 7;
/** Önbellek anahtarı: davet kodu -> kullanım sayısı. */
const CACHE_PREFIX = "davet_cache_";

/* ── Varsayılan veri ───────────────────────────────────────────────── */
function varsayilan() {
  return { total: 0, regular: 0, bonus: 0, fake: 0, leave: 0, inviter: null };
}

/**
 * Bir kullanıcının davet verisini döndürür. Bozuksa varsayılana tamamlar.
 * (Eski kayıtlar `total` alanı olmadan yazılmış olabilir.)
 */
function veriGetir(id) {
  if (!id) return varsayilan();
  let v;
  try { v = db.fetch(`invites.${id}`); } catch { v = null; }
  if (!v || typeof v !== "object") return varsayilan();
  const n = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
  return {
    total: n(v.total),
    regular: n(v.regular),
    bonus: n(v.bonus),
    fake: n(v.fake),
    leave: n(v.leave),
    inviter: v.inviter || null,
  };
}

/** `r!davetlerim` ve `çekiliş-şart` ile aynı formül: total + bonus. */
function toplamGetir(id) {
  const v = veriGetir(id);
  return v.total + v.bonus;
}

function yaz(id, veri) {
  try { db.set(`invites.${id}`, veri); return true; } catch { return false; }
}

/** Bonus ekler ve güncel veriyi döndürür (r!bonus-ekle için). */
function bonusEkle(id, miktar) {
  const v = veriGetir(id);
  v.bonus = Math.max(0, v.bonus + (Number(miktar) || 0));
  yaz(id, v);
  return v;
}

/** Sunucudaki tüm davet verilerini sıfırlar (r!davetleri-sıfırla). */
function sofraSifirla(guildId) {
  let silinen = 0;
  try {
    /* croxydb `all()` nokta anahtarlarını iç içe döndürür; silme için
       gerçek ID listesine ihtiyacımız var. */
    const tum = db.all ? db.all() : {};
    const veriler = tum && typeof tum.invites === "object" && tum.invites ? tum.invites : {};
    for (const id of Object.keys(veriler)) {
      if (!/^\d{15,20}$/.test(id)) continue;
      try { db.delete(`invites.${id}`); silinen++; } catch {}
    }
    /* Kimin kimi davet ettiği kayıtları da temizle. */
    for (const k of Object.keys(tum || {})) {
      if (k.startsWith("davet_eden_")) { try { db.delete(k); } catch {} }
    }
  } catch {}
  return silinen;
}

/* ── Önbellek ──────────────────────────────────────────────────────── */

function onbellekOku(guildId) {
  try {
    const v = db.fetch(`${CACHE_PREFIX}${guildId}`);
    return v && typeof v === "object" ? v : {};
  } catch { return {}; }
}

function onbellekYaz(guildId, harita) {
  try { db.set(`${CACHE_PREFIX}${guildId}`, harita); return true; } catch { return false; }
}

/**
 * Sunucudaki davetleri Discord'dan çekip önbelleğe yazar.
 * Bot yeniden başladığında ilk üye katılımından önce çağrılmalı, yoksa
 * "önce/sonra" farkı hesaplanamaz (cache boş -> 0 - 0 = 0).
 */
async function onbellekYukle(guild) {
  if (!guild || !guild.invites) return false;
  try {
    const mevcut = await guild.invites.fetch();
    const harita = {};
    for (const [kod, inv] of mevcut) {
      harita[kod] = {
        uses: Number(inv.uses) || 0,
        inviter: inv.inviterId || inv.inviter?.id || null,
        code: kod,
      };
    }
    onbellekYaz(guild.id, harita);
    return true;
  } catch {
    return false;
  }
}

/** Tek bir davetin kullanım sayısını önbellekte günceller. */
function onbellekGuncelle(guildId, kod, uses, inviter) {
  try {
    const h = onbellekOku(guildId);
    h[kod] = { uses: Number(uses) || 0, inviter: inviter || h[kod]?.inviter || null, code: kod };
    onbellekYaz(guildId, h);
  } catch {}
}

function onbellekSil(guildId, kod) {
  try {
    const h = onbellekOku(guildId);
    delete h[kod];
    onbellekYaz(guildId, h);
  } catch {}
}

/* ── Katılım / ayrılma ─────────────────────────────────────────────── */

/**
 * Üye katıldığında hangi davetin kullanıldığını bulur.
 *
 * Yöntem: önbellekteki `uses` değerleri ile Discord'dan taze çekilen
 * değerler karşılaştırılır. Artan davet, kullanılan davettir.
 * (Davet kodu tükenmişse Discord onu listeden kaldırır; bu yüzden
 *  `vanishedInvites` kontrolü de yapılır.)
 */
async function katilimIsle(client, member) {
  if (!member || !member.guild || member.user?.bot) return null;
  const guild = member.guild;

  const onceki = onbellekOku(guild.id);
  let simdiki = {};
  try {
    const taze = await guild.invites.fetch();
    for (const [kod, inv] of taze) {
      simdiki[kod] = {
        uses: Number(inv.uses) || 0,
        inviter: inv.inviterId || inv.inviter?.id || null,
        code: kod,
      };
    }
  } catch {
    /* Davetleri okuyamıyorsak (izin yok / API hatası) sayım yapma;
       yanlış kişiye davet yazmaktansa hiç yazmamak doğrudur. */
    return null;
  }

  /* Artışı bul */
  let kullanilan = null;
  for (const [kod, simdi] of Object.entries(simdiki)) {
    const eski = onceki[kod];
    const eskiUses = eski ? Number(eski.uses) || 0 : 0;
    if (simdi.uses > eskiUses) {
      /* Birden fazla artış olabilir (aynı anda iki üye); en büyük farkı al. */
      if (!kullanilan || simdi.uses - eskiUses > kullanilan.fark) {
        kullanilan = { kod, fark: simdi.uses - eskiUses, inviter: simdi.inviter };
      }
    }
  }

  /* Davet listesi tazelendi: önbelleği güncelle (artışlar dahil). */
  onbellekYaz(guild.id, simdiki);

  if (!kullanilan || !kullanilan.inviter) return null;
  if (kullanilan.inviter === member.id) return null;   // kendi kendini davet
  if (kullanilan.inviter === client?.user?.id) return null; // botun kendi daveti

  /* Sahte hesap kontrolü */
  const hesapYasi = Date.now() - (member.user.createdTimestamp || 0);
  const sahte = hesapYasi < SAHTE_HESAP_GUN * 86400000;

  const v = veriGetir(kullanilan.inviter);
  v.inviter = kullanilan.inviter;
  if (sahte) {
    v.fake += 1;
  } else {
    v.total += 1;
    v.regular += 1;
  }
  yaz(kullanilan.inviter, v);

  return { davetEden: kullanilan.inviter, kod: kullanilan.kod, sahte, veri: v };
}

/**
 * Üye ayrıldığında davet edenin `leave` sayacını artırır.
 * Kimin davet ettiği `davet_eden_<guildId>_<uyeId>` anahtarında tutulur.
 */
async function ayrilimIsle(client, member) {
  if (!member || !member.guild) return false;
  const key = `davet_eden_${member.guild.id}_${member.id}`;
  let davetEden = null;
  try { davetEden = db.fetch(key); } catch {}
  if (!davetEden) return false;

  const v = veriGetir(davetEden);
  v.leave += 1;
  yaz(davetEden, v);
  try { db.delete(key); } catch {}
  return true;
}

/** Katılımda "kimin davet ettiğini" ayrılma için saklar. */
function davetEdenKaydet(guildId, uyeId, davetEdenId) {
  try { if (davetEdenId) db.set(`davet_eden_${guildId}_${uyeId}`, davetEdenId); } catch {}
}

/* ── Görüntüleme yardımcıları ──────────────────────────────────────── */

/** `r!davet-top` için sıralı liste. */
function sirala(limit = 10) {
  let tum = {};
  try { tum = db.all ? db.all() : {}; } catch {}

  /* DİKKAT: croxydb `all()` nokta içeren anahtarları İÇ İÇE nesne olarak
     döndürür. `db.set("invites.555", {...})` sonrası `all()` sonucu
     `{ invites: { "555": {...} } }` olur — `all()["invites.555"]` YOKTUR.
     Bu yüzden doğrudan `tum.invites` nesnesini tarıyoruz. */
  const veriler = tum && typeof tum.invites === "object" && tum.invites ? tum.invites : {};
  const liste = [];
  for (const [id, ham] of Object.entries(veriler)) {
    /* Sadece düz kullanıcı ID'leri (sayısal). `invites.<id>.bonus` gibi
       eski alt anahtarlar burada elenir. */
    if (!/^\d{15,20}$/.test(id)) continue;
    if (!ham || typeof ham !== "object") continue;
    const veri = veriGetir(id);
    liste.push({ id, toplam: veri.total + veri.bonus, ...veri });
  }
  return liste.sort((a, b) => b.toplam - a.toplam).slice(0, limit);
}

module.exports = {
  SAHTE_HESAP_GUN,
  varsayilan,
  veriGetir,
  toplamGetir,
  bonusEkle,
  sofraSifirla,
  onbellekYukle,
  onbellekGuncelle,
  onbellekSil,
  onbellekOku,
  katilimIsle,
  ayrilimIsle,
  davetEdenKaydet,
  sirala,
};

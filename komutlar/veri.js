const { EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const db = require("croxydb");
const { getLangSync, t } = require("../dil");
const { SAHIP_ID, ownerLog } = require("../utils");

/* ═══════════════════════════════════════════════════════════════
   SAHİP VERİ TARAYICI
   r!veri gör  <id>            → o ID'ye bağlı TÜM kayıtlar (kullanıcı ya da sunucu)
   r!veri say                  → toplam kayıt sayısı + en büyük gruplar
   r!veri ara  <metin>         → anahtar veya değer içinde arama
   r!veri kategori             → tüm veri grupları ve sayıları
   r!veri kullanici <id> · sunucu <id>   → kısa özet kartı
   r!veri dosya [filtre]       → txt dökümü (dosya eki)
   r!veri sil  <id>            → o ID'nin tüm verilerini sil
   ═══════════════════════════════════════════════════════════════ */

const KISI_ANAHTARLARI = [
  "para", "bankapara", "iban", "xp", "seviye", "seviyeatlama", "pets", "premium",
  "vote", "dmail", "language", "afk", "onay", "yedek_veri", "otomasyon", "engel",
  "karalist", "sebep", "gunluk_ai", "betaTesterler", "modlar", "consent",
];
const SUNUCU_ANAHTARLARI = [
  "gçkanal", "cikisM", "kayıt-kayıtsız", "kayıt-kadın", "kayıt-erkek", "kayıt-kanal",
  "kayıt-tag", "reklam", "kufur", "spam", "otoegitim", "otocevapsiz", "otomasyon",
  "modlog", "sayaç", "otorol", "hgdmesaj", "prefix", "slanguage", "premium_plan",
];
const AI_ANAHTARLARI = ["ai_qa_", "ai_pending_", "ai_learn_", "otoegitim_", "otocevapsiz_"];

/** Değerin ne olduğunu/boyutunu özetler (asla tam token/şifre yazmaz). */
function degerOzeti(v) {
  if (v === null || v === undefined) return "boş";
  if (typeof v === "string") {
    if (/token|sifre|şifre|secret|key|webhook/i.test(v)) return "**gizli (gösterilmez)**";
    const temiz = v.replace(/\s+/g, " ").trim();
    return temiz.length > 180 ? `${temiz.slice(0, 180)}… (${v.length} kr)` : temiz || "boş metin";
  }
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) {
    const ornek = v.slice(0, 5).map(x => typeof x === "object" ? `{${Object.keys(x).slice(0, 3).join(",")}}` : String(x).slice(0, 24)).join(", ");
    return `dizi · ${v.length} öğe${v.length ? ` → ${ornek}${v.length > 5 ? ", …" : ""}` : ""}`;
  }
  if (typeof v === "object") {
    const anahtar = Object.keys(v);
    const onemli = ["soru", "cevap", "cevap_en", "name", "sex", "yaş", "ad", "durum", "aktif", "tarih", "guildId", "userId"]
      .filter(k => k in v)
      .map(k => {
        const x = v[k];
        const s = typeof x === "string" ? (x.length > 90 ? x.slice(0, 90) + "…" : x) : String(x);
        return `${k}=${s}`;
      });
    if (onemli.length) return onemli.join(" · ").slice(0, 300);
    return `nesne · ${anahtar.length} alan (${anahtar.slice(0, 8).join(", ")}${anahtar.length > 8 ? "…" : ""})`;
  }
  return String(v).slice(0, 120);
}

/** Anahtarın hangi gruba ait olduğunu tahmin eder. */
function grupAdi(k) {
  if (k.startsWith("ai_qa_")) return "AI öğretilen";
  if (k.startsWith("ai_pending_")) return "AI onay bekleyen";
  if (k.startsWith("otoegitim_")) return "Sunucu otomasyon eğitimi";
  if (k.startsWith("otocevapsiz_")) return "Otomasyon cevapsız";
  if (k.startsWith("ass.")) return "Asistan";
  if (k.startsWith("ticket.")) return "Ticket";
  if (k.startsWith("gçkanal_")) return "Hoşgeldin kanalı";
  if (k.startsWith("cikisM_")) return "Hoşgeldin mesajı";
  if (k.startsWith("para_")) return "Ekonomi – cüzdan";
  if (k.startsWith("bankapara_")) return "Ekonomi – banka";
  if (k.startsWith("iban_")) return "Ekonomi – IBAN";
  if (k.startsWith("xp_") || k.startsWith("seviye")) return "Seviye";
  if (k.startsWith("premium")) return "Premium";
  if (k.startsWith("language_") || k.startsWith("slanguage_")) return "Dil";
  if (k.startsWith("consent_")) return "Veri onayı";
  if (k.startsWith("karalist_")) return "Kara liste";
  if (k.startsWith("kupon")) return "Kupon";
  if (k.startsWith("afk")) return "AFK";
  if (k.startsWith("kayıt")) return "Kayıt sistemi";
  if (k.startsWith("pets_")) return "Evcil hayvan";
  if (k.startsWith("dmail")) return "DM";
  if (k.startsWith("yedek")) return "Yedek";
  if (k.startsWith("reklam") || k.startsWith("kufur") || k.startsWith("spam")) return "Koruma";
  return "Diğer";
}

/** ID'ye bağlı tüm kayıtları bulur (kullanıcı veya sunucu). */
function verileriTara(id) {
  const all = db.all() || {};
  const sid = String(id);
  const bulunan = [];
  for (const k of Object.keys(all)) {
    const v = all[k];
    // 1) Doğrudan sonek: xxx_<id> veya xxx.<id>
    if (k === sid) { bulunan.push(k); continue; }
    if (k.endsWith(`_${sid}`)) { bulunan.push(k); continue; }
    if (k.includes(`.${sid}.`) || k.endsWith(`.${sid}`) || k.includes(`.${sid}_`)) { bulunan.push(k); continue; }
    // 2) Önek: <id>_xxx
    if (k.startsWith(`${sid}_`)) { bulunan.push(k); continue; }
    // 3) İçinde geçiyor (array/nesne üyesi)
    if (k === "hatirlaticilar" && Array.isArray(v) && v.some(h => String(h.userId) === sid)) { bulunan.push(k); continue; }
    if (k === "betaTesterler" && Array.isArray(v) && v.map(String).includes(sid)) { bulunan.push(k); continue; }
    if (k === "modlar" && Array.isArray(v) && v.map(String).includes(sid)) { bulunan.push(k); continue; }
    // 4) Kayıt nesnesinin sahibi/ekleyeni
    if (v && typeof v === "object" && !Array.isArray(v)) {
      if (String(v.ekleyen) === sid || String(v.ogreten) === sid) { bulunan.push(k); continue; }
    }
  }
  return [...new Set(bulunan)];
}

function embedSayfa(embedler, message) {
  let i = 0;
  const e = embedler[i];
  const row = embedler.length > 1 ? new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("veri_onceki").setLabel("◀").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("veri_sonraki").setLabel("▶").setStyle(ButtonStyle.Secondary),
  ) : null;
  return message.reply({ embeds: [e], components: row ? [row] : [] }).then(msg => {
    if (!row) return msg;
    const col = msg.createMessageComponentCollector({ filter: x => x.user.id === message.author.id, time: 120000 });
    col.on("collect", async (int) => {
      i = int.customId === "veri_sonraki" ? Math.min(embedler.length - 1, i + 1) : Math.max(0, i - 1);
      await int.update({ embeds: [embedler[i]] }).catch(() => {});
    });
    return msg;
  }).catch(() => {});
}

exports.run = async (client, message, args) => {
  const lang = getLangSync(message.author.id);
  const EN = lang === "en";
  const prefix = process.env.PREFIX || "r!";
  if (message.author.id !== SAHIP_ID)
    return message.reply(t(lang, "ortak.sahipSadece")).catch(() => {});

  const sub = (args[0] || "").toLowerCase();
  const all = db.all() || {};
  const toplamAnahtar = Object.keys(all).length;

  const yardim = () =>
    message.reply({
      embeds: [new EmbedBuilder().setColor("Blue").setTitle("🗄️ Veri Komutu (sahip)")
        .setDescription(
          [
            `**${prefix}veri gör <id>** → o ID'nin TÜM verileri (sayfalı)`,
            `**${prefix}veri say** → toplam kayıt + en büyük gruplar`,
            `**${prefix}veri kategori** → tüm veri grupları ve sayıları`,
            `**${prefix}veri ara <metin>** → anahtar/değer içinde arama`,
            `**${prefix}veri kullanici <id>** · **${prefix}veri sunucu <id>**`,
            `**${prefix}veri dosya [filtre]** → tam dökümü .txt olarak gönderir`,
            `**${prefix}veri sil <id>** → o ID'nin tüm verilerini siler`,
            ``,
            `Şu an **${toplamAnahtar.toLocaleString("tr-TR")}** anahtar var.`,
          ].join("\n")
        )],
    }).catch(() => {});

  /* ── SAY ─────────────────────────────────────────────────── */
  if (["say", "count", "istatistik", "stats", "özet", "ozet"].includes(sub)) {
    const grup = {};
    let nesne = 0, dizi = 0, metin = 0, sayi = 0;
    for (const [k, v] of Object.entries(all)) {
      const g = grupAdi(k);
      grup[g] = (grup[g] || 0) + 1;
      if (Array.isArray(v)) dizi++;
      else if (v && typeof v === "object") nesne++;
      else if (typeof v === "string") metin++;
      else sayi++;
    }
    const sirali = Object.entries(grup).sort((a, b) => b[1] - a[1]).slice(0, 15);
    const e = new EmbedBuilder().setColor("Blue")
      .setTitle("📊 Veri İstatistiği")
      .addFields(
        { name: "Toplam anahtar", value: `**${toplamAnahtar.toLocaleString("tr-TR")}**`, inline: true },
        { name: "Nesne / Dizi", value: `${nesne.toLocaleString("tr-TR")} / ${dizi.toLocaleString("tr-TR")}`, inline: true },
        { name: "Metin / Sayı", value: `${metin.toLocaleString("tr-TR")} / ${sayi.toLocaleString("tr-TR")}`, inline: true },
        { name: "En büyük gruplar", value: sirali.map(([g, n]) => `• \`${g}\`: ${n.toLocaleString("tr-TR")}`).join("\n") || "-", inline: false },
      )
      .setFooter({ text: `r!veri kategori · r!veri gör <id> · r!veri dosya` })
      .setTimestamp();
    return message.reply({ embeds: [e] }).catch(() => {});
  }

  /* ── KATEGORİ ────────────────────────────────────────────── */
  if (["kategori", "kategoriler", "grup", "groups", "keys"].includes(sub)) {
    const grup = {};
    for (const k of Object.keys(all)) {
      const g = grupAdi(k);
      grup[g] = (grup[g] || 0) + 1;
    }
    const sirali = Object.entries(grup).sort((a, b) => b[1] - a[1]);
    const parca = [];
    let birikim = "", sayfaNo = 1;
    for (const [g, n] of sirali) {
      const satir = `• \`${g}\`: **${n.toLocaleString("tr-TR")}**\n`;
      if (birikim.length + satir.length > 1000) { parca.push(birikim); birikim = ""; }
      birikim += satir;
    }
    if (birikim) parca.push(birikim);
    const embedler = parca.map((p, i) => new EmbedBuilder().setColor("Blue")
      .setTitle(`🗂️ Veri Kategorileri (${i + 1}/${parca.length})`)
      .setDescription(p)
      .setFooter({ text: `Toplam ${toplamAnahtar.toLocaleString("tr-TR")} anahtar` }));
    return embedSayfa(embedler.length ? embedler : [new EmbedBuilder().setColor("Red").setTitle("Kayıt yok")], message);
  }

  /* ── ARA ─────────────────────────────────────────────────── */
  if (["ara", "search", "bul"].includes(sub)) {
    const terim = args.slice(1).join(" ").trim();
    if (!terim) return message.reply(`🔎 Kullanım: \`${prefix}veri ara <metin>\``).catch(() => {});
    const q = terim.toLowerCase();
    const bulunan = [];
    for (const [k, v] of Object.entries(all)) {
      const ozet = degerOzeti(v).toLowerCase();
      if (k.toLowerCase().includes(q) || ozet.includes(q)) bulunan.push([k, v]);
    }
    if (!bulunan.length) return message.reply(`🔎 \`${terim}\` için kayıt bulunamadı.`).catch(() => {});
    const gosterilen = bulunan.slice(0, 25);
    const e = new EmbedBuilder().setColor("Green")
      .setTitle(`🔎 "${terim.slice(0, 60)}" — ${bulunan.length} sonuç`)
      .setDescription(gosterilen.map(([k, v]) => `\`${k.slice(0, 60)}\`\n> ${degerOzeti(v).slice(0, 120)}`).join("\n").slice(0, 3800))
      .setFooter({ text: bulunan.length > 25 ? `İlk 25 gösteriliyor · r!veri dosya ${terim}` : `r!veri gör <id> ile detay` })
      .setTimestamp();
    return message.reply({ embeds: [e] }).catch(() => {});
  }

  /* ── DOSYA (tam döküm) ───────────────────────────────────── */
  if (["dosya", "file", "döküm", "dokum", "export", "dışa"].includes(sub)) {
    const filtre = args.slice(1).join(" ").trim().toLowerCase();
    const satirlar = [];
    satirlar.push(`# RiseBunny Veri Dökümü — ${new Date().toISOString()}`);
    satirlar.push(`# Toplam anahtar: ${toplamAnahtar}`);
    if (filtre) satirlar.push(`# Filtre: ${filtre}`);
    satirlar.push("");
    let sayac = 0;
    for (const [k, v] of Object.entries(all).sort((a, b) => a[0].localeCompare(b[0]))) {
      if (filtre && !k.toLowerCase().includes(filtre)) continue;
      // Gizli değerler döküme de yazılmaz
      const ozet = /token|sifre|şifre|secret|key|webhook/i.test(degerOzeti(v)) ? "<gizli>" : degerOzeti(v);
      satirlar.push(`${k} = ${ozet}`);
      sayac++;
      if (satirlar.length > 20000) { satirlar.push("… (döküm çok uzun, kısaltıldı)"); break; }
    }
    satirlar.push("");
    satirlar.push(`# Yazılan kayıt: ${sayac}`);
    const buffer = Buffer.from(satirlar.join("\n"), "utf8");
    const { AttachmentBuilder } = require("discord.js");
    const dosya = new AttachmentBuilder(buffer, { name: `risebunny-veri-${Date.now()}.txt` });
    return message.reply({
      content: `🗄️ **${sayac}** kayıt dökümü (${(buffer.length / 1024).toFixed(1)} KB)`,
      files: [dosya],
    }).catch(() => message.reply("❌ Döküm gönderilemedi (dosya çok büyük olabilir).").catch(() => {}));
  }

  /* ── KULLANICI / SUNUCU özet kartı ───────────────────────── */
  if (["kullanici", "kullanıcı", "user", "sunucu", "guild", "server"].includes(sub)) {
    const hedef = String(args[1] || "").replace(/\D/g, "").slice(0, 25);
    if (!hedef) return message.reply(`🔎 Kullanım: \`${prefix}veri ${sub} <id>\``).catch(() => {});
    const anahtarlar = verileriTara(hedef);
    const gruplar = {};
    for (const k of anahtarlar) {
      const g = grupAdi(k);
      gruplar[g] = (grupl[g] || 0) + 1;
    }
    // Kritik alanlar
    const para = db.fetch(`para_${hedef}`), banka = db.fetch(`bankapara_${hedef}`);
    const xp = db.fetch(`xp_${hedef}`), seviye = db.fetch(`seviye_${hedef}`);
    const prem = db.fetch(`premium_${hedef}`);
    const dil = db.fetch(`language_${hedef}`);
    const onay = db.fetch(`consent_${hedef}`);
    const kl = db.fetch(`karalist_${hedef}`);
    const e = new EmbedBuilder().setColor("Blue")
      .setTitle(`🗄️ Veri Kartı — ${hedef}`)
      .addFields(
        { name: "Toplam kayıt", value: `**${anahtarlar.length}**`, inline: true },
        { name: "Grup sayısı", value: `**${Object.keys(gruplar).length}**`, inline: true },
        { name: "Dil / Onay", value: `\`${dil ?? "-"}\` / ${onay ? "✅" : "❌"}`, inline: true },
        { name: "Cüzdan / Banka", value: `\`${Number(para || 0).toLocaleString("tr-TR")}\` / \`${Number(banka || 0).toLocaleString("tr-TR")}\``, inline: true },
        { name: "Seviye / XP", value: `\`${seviye ?? 0}\` / \`${xp ?? 0}\``, inline: true },
        { name: "Premium", value: prem ? `✅ ${typeof prem === "object" ? degerOzeti(prem) : prem}` : "❌", inline: true },
        { name: "Kara liste", value: kl ? `⛔ \`${kl}\`` : "temiz", inline: true },
        { name: "Gruplar", value: Object.entries(gruplar).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([g, n]) => `• ${g}: ${n}`).join("\n") || "-", inline: false },
      )
      .setFooter({ text: `Detay: ${prefix}veri gör ${hedef}` })
      .setTimestamp();
    return message.reply({ embeds: [e] }).catch(() => {});
  }

  /* ── SİL ─────────────────────────────────────────────────── */
  if (["sil", "delete", "silme", "temizle"].includes(sub)) {
    const hedef = String(args[1] || "").replace(/\D/g, "").slice(0, 25);
    if (!hedef) return message.reply(`🗑️ Kullanım: \`${prefix}veri sil <id>\``).catch(() => {});
    const keys = verileriTara(hedef);
    let n = 0;
    for (const k of keys) {
      try { db.delete(k); n++; } catch {}
    }
    try {
      const hat = db.get("hatirlaticilar") || [];
      if (Array.isArray(hat) && hat.some(h => String(h.userId) === hedef)) {
        db.set("hatirlaticilar", hat.filter(h => String(h.userId) !== hedef)); n++;
      }
    } catch {}
    try {
      const ayarlar = require("../ayarlar.json");
      if (Array.isArray(ayarlar.premiumIDs) && ayarlar.premiumIDs.map(String).includes(hedef)) {
        ayarlar.premiumIDs = ayarlar.premiumIDs.filter(x => String(x) !== hedef);
        require("fs").writeFileSync("./ayarlar.json", JSON.stringify(ayarlar, null, 2));
      }
    } catch {}
    try { ownerLog(client, `🗑️ **Veri silindi (sahip):** \`${hedef}\` — ${n} kayıt (${message.author.tag})`).catch(() => {}); } catch {}
    return message.reply(t(lang, "veri.silOk", { sayi: n, hedef })).catch(() => {});
  }

  /* ── GÖR (detaylı, sayfalı) ──────────────────────────────── */
  const hedef = String(args[sub === "gör" || sub === "gor" || sub === "see" || sub === "show" ? 1 : 0] || "").replace(/\D/g, "").slice(0, 25);
  if ((sub === "gör" || sub === "gor" || sub === "see" || sub === "show" || /^\d{15,25}$/.test(hedef)) && hedef) {
    const keys = verileriTara(hedef);
    if (!keys.length) {
      return message.reply({ embeds: [new EmbedBuilder().setColor("Red").setTitle("🗄️ Kayıt yok").setDescription(`\`${hedef}\` için hiçbir veri bulunamadı.\n\`${prefix}veri ara ${hedef}\` ile farklı bir arama deneyebilirsin.`)] }).catch(() => {});
    }
    const grup = {};
    for (const k of keys) {
      const g = grupAdi(k);
      grup[g] = (grup[g] || 0) + 1;
    }
    // Her kaydı ayrı satırda göster; sayfa başına ~20 kayıt
    const satirlar = keys.sort().map(k => {
      let v;
      try { v = db.fetch(k); } catch { v = undefined; }
      return `\`${k.length > 55 ? k.slice(0, 55) + "…" : k}\`\n> ${degerOzeti(v).slice(0, 150)}`;
    });
    const SAYFA = 18;
    const embedler = [];
    for (let i = 0; i < satirlar.length; i += SAYFA) {
      const dilim = satirlar.slice(i, i + SAYFA);
      embedler.push(new EmbedBuilder().setColor("Blue")
        .setTitle(`🗄️ Veri: ${hedef} — ${embedler.length + 1}/${Math.ceil(satirlar.length / SAYFA)}`)
        .setDescription(dilim.join("\n").slice(0, 3900))
        .addFields({
          name: "Özet", inline: false,
          value: `Toplam **${keys.length}** kayıt · ` +
            Object.entries(grup).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([g, n]) => `${g}: ${n}`).join(" · "),
        })
        .setFooter({ text: `Sil: ${prefix}veri sil ${hedef} · Döküm: ${prefix}veri dosya` }));
    }
    return embedSayfa(embedler, message);
  }

  return yardim();
};

exports.conf = { enabled: true, guildOnly: false, aliases: ["data", "veriler"], permLevel: 5, kategori: "sahip" };
exports.help = {
  name: "veri",
  description: "Tüm veri kayıtlarını görüntüler, arar, döker ve siler. (Sadece sahip)",
  usage: "veri gör|say|kategori|ara|kullanici|sunucu|dosya|sil [id|metin]",
};

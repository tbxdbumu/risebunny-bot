/**
 * util/transcript.js — Ticket transkripti (HTML)
 *
 * MEE6 tarzı: bilet kapanınca kanal geçmişi tek bir HTML dosyasına
 * dönüştürülür; log kanalına (ya da bilet kanalına) dosya olarak atılır.
 *
 * DB
 * --  ticket_transcript_kanal.<gid> = kanalId | null ("bu kanal" için "yok")
 * --  ticket_transcript_otomatik.<gid> = true   (kapatınca otomatik al)
 *
 * KULLANIM
 *   const { transkriptOlustur, transkriptGonder } = require("../util/transcript");
 *   const { buffer, adet } = await transkriptOlustur(channel);
 *   await transkriptGonder(client, guild, channel, { buffer, adet, kapatan });
 */
const { AttachmentBuilder, EmbedBuilder } = require("discord.js");
const db = require("croxydb");
const { getLangSync, t } = require("../dil");

const MAX_MESAJ = 1500;      // tek sayfada toplanacak üst sınır
const SAYFA_BOYUT = 100;
const MAX_SAYFA = 15;        // 15 x 100 = 1500

function kacis(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function zaman(ts) {
  try {
    return new Date(ts).toLocaleString("tr-TR", {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit"
    });
  } catch { return String(ts); }
}

/** Mesaj içeriğini güvenli HTML'e çevirir (satır sonu, link, kod bloğu). */
function icerikHtml(mesaj) {
  let c = mesaj.content || "";
  if (!c && mesaj.embeds?.length) {
    c = mesaj.embeds.map(e =>
      [e.title, e.description].filter(Boolean).join("\n")).join("\n---\n");
  }
  let h = kacis(c);

  h = h.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, dil, kod) =>
    `<pre><code class="language-${kacis(dil || "text")}">${kod}</code></pre>`);
  h = h.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  h = h.replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>");
  h = h.replace(/\*([^*\n]+)\*/g, "<i>$1</i>");
  h = h.replace(/~~([^~\n]+)~~/g, "<s>$1</s>");
  h = h.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  h = h.replace(/\n/g, "<br>");

  const ekler = [];
  for (const ek of mesaj.attachments?.values?.() || []) {
    ekler.push(`<a class="ek" href="${kacis(ek.url)}" target="_blank" rel="noopener">📎 ${kacis(ek.name)}</a>`);
  }
  for (const [ad, emoji] of mesaj.reactions?.cache || []) {
    ekler.push(`<span class="tepki">${kacis(ad)} ${emoji.count}</span>`);
  }
  return h + (ekler.length ? `<div class="ekler">${ekler.join(" ")}</div>` : "");
}

function mesajHtml(m) {
  const bot = m.author?.bot ? ' class="bot"' : "";
  const avatar = m.author?.displayAvatarURL?.({ size: 64 }) || "";
  const ad = kacis(m.author?.tag || m.author?.username || "?");
  return `<div class="mesaj"${bot} id="m-${m.id}">
  <img class="avatar" src="${kacis(avatar)}" alt="">
  <div class="govde">
    <div class="baslik"><span class="ad">${ad}</span><span class="saat">${zaman(m.createdTimestamp)}</span></div>
    <div class="icerik">${icerikHtml(m)}</div>
  </div>
</div>`;
}

function htmlSar({ guild, kanal, mesajlar, adet }) {
  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${kacis(guild.name)} • #${kacis(kanal.name)} — Transcript</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin:0; background:#1e1f22; color:#dbdee1; font:15px/1.45 "Segoe UI",system-ui,sans-serif; }
  header { position:sticky; top:0; background:#2b2d31; border-bottom:1px solid #1a1b1e; padding:14px 20px; display:flex; gap:12px; align-items:center; }
  header h1 { font-size:16px; margin:0; color:#f2f3f5; }
  header .meta { font-size:12px; color:#949ba4; }
  main { padding:16px 20px 60px; max-width:1000px; margin:0 auto; }
  .mesaj { display:flex; gap:12px; padding:8px 10px; border-radius:8px; }
  .mesaj:hover { background:#26282c; }
  .mesaj.bot .ad { color:#5865f2; }
  .avatar { width:38px; height:38px; border-radius:50%; flex:0 0 38px; background:#404249; }
  .govde { min-width:0; flex:1; }
  .baslik { display:flex; gap:8px; align-items:baseline; flex-wrap:wrap; }
  .ad { font-weight:600; color:#f2f3f5; }
  .saat { font-size:11px; color:#80848e; }
  .icerik { white-space:normal; word-wrap:break-word; overflow-wrap:anywhere; }
  .icerik code { background:#1a1b1e; padding:1px 4px; border-radius:4px; font-size:13px; }
  .icerik pre { background:#1a1b1e; padding:10px; border-radius:6px; overflow:auto; }
  .ekler { margin-top:6px; display:flex; gap:8px; flex-wrap:wrap; font-size:13px; }
  .ek { color:#00a8fc; text-decoration:none; }
  .tepki { background:#2b2d31; border:1px solid #3f4147; border-radius:10px; padding:0 6px; font-size:12px; }
  a { color:#00a8fc; }
  .bos { color:#80848e; font-style:italic; }
  footer { text-align:center; color:#6d6f78; font-size:12px; padding:20px; }
</style>
</head>
<body>
<header>
  <h1>🎫 ${kacis(guild.name)} — #${kacis(kanal.name)}</h1>
  <span class="meta">${adet} message(s) • ${zaman(Date.now())}</span>
</header>
<main>
${mesajlar.length ? mesajlar.map(mesajHtml).join("\n") : '<p class="bos">No messages.</p>'}
</main>
<footer>RiseBunny • transcript</footer>
</body>
</html>`;
}

/**
 * Kanal geçmişini sayfa sayfa çeker.
 * @returns {Promise<{mesajlar: object[], adet:number}>}
 */
async function gecmisCek(channel) {
  let onceki = null;
  const hepsi = [];
  for (let s = 0; s < MAX_SAYFA && hepsi.length < MAX_MESAJ; s++) {
    const parti = await channel.messages.fetch({
      limit: SAYFA_BOYUT,
      ...(onceki ? { before: onceki } : {})
    }).catch(() => null);
    if (!parti || parti.size === 0) break;
    hepsi.push(...parti.values());
    onceki = parti.last().id;
    if (parti.size < SAYFA_BOYUT) break;
  }
  // Discord en yeniyi ilk döner → eskiden yeniye sırala
  return { mesajlar: hepsi.reverse(), adet: hepsi.length };
}

/**
 * HTML transkript buffer'ı üretir.
 * @returns {Promise<{buffer: Buffer, adet: number, ad: string}>}
 */
async function transkriptOlustur(channel, { kapatan } = {}) {
  const guild = channel.guild;
  const { mesajlar, adet } = await gecmisCek(channel);
  const html = htmlSar({ guild, kanal: channel, mesajlar, adet, kapatan });
  const ad = `transcript-${guild.name.replace(/[^\p{L}\p{N}_-]+/gu, "_").slice(0, 30)}-${channel.name.slice(0, 40)}-${Date.now()}.html`;
  return { buffer: Buffer.from(html, "utf8"), adet, ad };
}

/**
 * Transkripti uygun kanala dosya olarak gönderir.
 * Hedef: `ticket_transcript_kanal.<gid>` → yoksa içinde bulunduğu kanalın üst log kanalı yoksa kendisi.
 * @returns {Promise<boolean>}
 */
async function transkriptGonder(client, guild, channel, { buffer, adet, ad, kapatanId } = {}) {
  const lang = getLangSync(guild.ownerId);
  const hedefId = db.fetch(`ticket_transcript_kanal.${guild.id}`);
  let hedef = hedefId ? guild.channels.cache.get(hedefId) : null;
  if (!hedef) {
    const logId = db.fetch(`log_${guild.id}`);
    hedef = logId ? guild.channels.cache.get(logId) : null;
  }
  if (!hedef) hedef = channel;

  try {
    await hedef.send({
      embeds: [new EmbedBuilder()
        .setColor("#2b2d31")
        .setTitle(t(lang, "transcript.baslik"))
        .setDescription(t(lang, "transcript.aciklama", {
          kanal: `#${channel.name}`,
          adet: adet ?? 0,
          kisi: kapatanId ? `<@${kapatanId}>` : "—"
        }))
        .setTimestamp()],
      files: [new AttachmentBuilder(buffer, { name: ad || "transcript.html", description: "Ticket transcript" })]
    });
    return true;
  } catch (e) {
    console.warn("[transcript]", e?.message || e);
    return false;
  }
}

/** Kapatma akışı için hepsi bir arada. Hata yutulur. */
async function otomatikTranskript(client, channel, { kapatanId } = {}) {
  try {
    if (!channel?.guild) return false;
    const acik = db.fetch(`ticket_transcript_otomatik.${channel.guild.id}`);
    if (acik === false) return false;
    const t0 = await transkriptOlustur(channel, { kapatan: kapatanId });
    return await transkriptGonder(client, channel.guild, channel, {
      buffer: t0.buffer, adet: t0.adet, ad: t0.ad, kapatanId
    });
  } catch (e) {
    console.warn("[transcript:auto]", e?.message || e);
    return false;
  }
}

module.exports = {
  transkriptOlustur,
  transkriptGonder,
  otomatikTranskript,
  gecmisCek,
  MAX_MESAJ
};

import fs from 'node:fs/promises';
await fs.mkdir('public/fonts', { recursive: true });
for (const [slug, name, range] of [
  ['manrope', 'Manrope', '400..800'],
  ['dm-sans', 'DM+Sans', '400..700'],
]) {
  const response = await fetch(
    `https://fonts.googleapis.com/css2?family=${name}:wght@${range}&display=swap`,
    { headers: { 'User-Agent': 'Mozilla/5.0 AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36' } },
  );
  if (!response.ok) throw Error('Font stylesheet unavailable');
  const css = await response.text(),
    urls = [...css.matchAll(/url\((https:\/\/[^)]+\.woff2)\)/g)].map((m) => m[1]);
  if (!urls.length) throw Error('No WOFF2 font found');
  const font = await fetch(urls.at(-1));
  if (!font.ok) throw Error('Font unavailable');
  await fs.writeFile(`public/fonts/${slug}.woff2`, Buffer.from(await font.arrayBuffer()));
  const license = await fetch(
    `https://raw.githubusercontent.com/google/fonts/main/ofl/${slug.replace('-', '')}/OFL.txt`,
  );
  if (license.ok) await fs.writeFile(`public/fonts/${slug}-OFL.txt`, await license.text());
}
console.log('Fontes locais e licenças preparadas.');

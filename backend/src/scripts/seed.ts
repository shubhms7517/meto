// Development ke liye test data. Chalane ke liye: npm run seed
// Note: ye users Firebase me nahi hain, isliye inse app me login nahi hoga.
// Ye Discover / Profile jaise screens pe doosre users dikhane ke kaam aate hain.
// Dobara chalane pe duplicate nahi banta.
import { env } from '../config/env.js';
import { sequelize } from '../db/sequelize.js';
import sharp from 'sharp';
import { saveImage } from '../lib/upload.js';
import { Follow, Gift, GiftTransaction, User, UserPhoto } from '../models/index.js';

if (env.NODE_ENV !== 'development') {
  console.error('❌ Seed sirf development me chalta hai');
  process.exit(1);
}

// Har baar same "random" data (seeded random)
let s = 42;
const rand = () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = <T>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)];
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);

type SeedUser = {
  name: string;
  gender: 'male' | 'female';
  birthday: string;
  city: string;
  languages: string;
  bio: string;
  isVerified: boolean;
  level: number;
  seenMinAgo: number; // < 2 = online
};

const USERS: SeedUser[] = [
  { name: 'Aisha', gender: 'female', birthday: '2002-03-11', city: 'Mumbai', languages: 'Hindi,English', bio: "I'll bring the vibes, you bring yourself 💫 Deal? 💘", isVerified: true, level: 4, seenMinAgo: 0 },
  { name: 'Kavya', gender: 'female', birthday: '2003-07-22', city: 'Pune', languages: 'Marathi,Hindi', bio: 'Chai > coffee ☕ Lets talk about movies 🎬', isVerified: false, level: 2, seenMinAgo: 1 },
  { name: 'Riya', gender: 'female', birthday: '1999-12-05', city: 'Delhi', languages: 'Hindi', bio: 'Weekend traveller ✈️ foodie 🍜', isVerified: true, level: 7, seenMinAgo: 0 },
  { name: 'Meera', gender: 'female', birthday: '2000-05-18', city: 'Jaipur', languages: 'Hindi,English', bio: 'Old songs and long talks 🎶', isVerified: false, level: 3, seenMinAgo: 5 },
  { name: 'Sana', gender: 'female', birthday: '2001-09-30', city: 'Hyderabad', languages: 'Urdu,Hindi,Telugu', bio: 'Smile is my makeup 😊', isVerified: true, level: 9, seenMinAgo: 1 },
  { name: 'Ananya', gender: 'female', birthday: '1998-01-14', city: 'Bengaluru', languages: 'Kannada,English', bio: 'Book lover 📚 & dog mom 🐶', isVerified: true, level: 12, seenMinAgo: 30 },
  { name: 'Priya', gender: 'female', birthday: '2002-11-02', city: 'Chennai', languages: 'Tamil,English', bio: 'Dance is my therapy 💃', isVerified: false, level: 1, seenMinAgo: 0 },
  { name: 'Neha', gender: 'female', birthday: '1997-06-25', city: 'Kolkata', languages: 'Bengali,Hindi', bio: 'Rasgulla fan forever 🍮', isVerified: true, level: 6, seenMinAgo: 90 },
  { name: 'Tanvi', gender: 'female', birthday: '2003-02-08', city: 'Ahmedabad', languages: 'Gujarati,Hindi', bio: 'Garba queen 🪔', isVerified: false, level: 2, seenMinAgo: 240 },
  { name: 'Zoya', gender: 'female', birthday: '2000-08-19', city: 'Lucknow', languages: 'Urdu,Hindi', bio: 'Shayari & sunsets 🌅', isVerified: true, level: 5, seenMinAgo: 1 },
  { name: 'Arjun', gender: 'male', birthday: '1996-04-03', city: 'Mumbai', languages: 'Hindi,English', bio: 'Gym, guitar and good vibes 🎸', isVerified: true, level: 8, seenMinAgo: 0 },
  { name: 'Rohan', gender: 'male', birthday: '1999-10-27', city: 'Delhi', languages: 'Hindi,Punjabi', bio: 'Cricket fan 🏏', isVerified: false, level: 3, seenMinAgo: 15 },
  { name: 'Kabir', gender: 'male', birthday: '1998-12-12', city: 'Goa', languages: 'English,Konkani', bio: 'Beach person 🏖️', isVerified: false, level: 4, seenMinAgo: 600 },
  { name: 'Vihaan', gender: 'male', birthday: '2001-01-21', city: 'Indore', languages: 'Hindi', bio: 'Foodie from the food capital 😋', isVerified: true, level: 2, seenMinAgo: 1 },
];

const GIFTS = [
  { name: 'Rose', icon: '🌹', price: 100, isRare: false },
  { name: 'Lollipop', icon: '🍭', price: 200, isRare: false },
  { name: 'Balloons', icon: '🎈', price: 300, isRare: false },
  { name: 'Cake', icon: '🎂', price: 500, isRare: false },
  { name: 'Unicorn', icon: '🦄', price: 800, isRare: false },
  { name: 'Love Heart', icon: '💘', price: 999, isRare: false },
  { name: 'Lipstick', icon: '💄', price: 1500, isRare: false },
  { name: 'Heels', icon: '👠', price: 3000, isRare: false },
  { name: 'Handbag', icon: '👜', price: 5000, isRare: false },
  { name: 'Ring', icon: '💍', price: 9999, isRare: true },
  { name: 'Diamond', icon: '💎', price: 29999, isRare: true },
  { name: 'Crown', icon: '👑', price: 49999, isRare: true },
  { name: 'Sports Car', icon: '🚗', price: 99999, isRare: true },
];

await sequelize.authenticate();
await sequelize.sync();

// 1. Gift catalog
for (const g of GIFTS) {
  await Gift.findOrCreate({ where: { name: g.name }, defaults: g });
}
const gifts = await Gift.findAll();
console.log(`🎁 Gifts: ${gifts.length}`);

// 2. Users (pehla seed user "Test User" bhi rehta hai)
await User.findOrCreate({
  where: { firebaseUid: 'seed_test_user_1' },
  defaults: {
    publicId: 100000001, firebaseUid: 'seed_test_user_1', phone: '+919000000001', email: null, authProvider: 'phone',
    name: 'Test User', gender: 'male', birthday: '1998-02-14', bio: 'Hi, I am a test user 👋', avatarUrl: null,
    city: 'Noida', languages: 'Hindi', lastLoginAt: new Date(), lastSeenAt: minutesAgo(3000),
  },
});

const seeded: User[] = [];
for (const [i, { seenMinAgo, ...u }] of USERS.entries()) {
  const uid = `seed_user_${i + 2}`;
  const [user] = await User.findOrCreate({
    where: { firebaseUid: uid },
    defaults: {
      publicId: 100000002 + i,
      firebaseUid: uid,
      phone: `+9190000000${String(i + 2).padStart(2, '0')}`,
      email: null,
      authProvider: 'phone',
      avatarUrl: null,
      lastLoginAt: new Date(),
      ...u,
      lastSeenAt: minutesAgo(seenMinAgo),
    },
  });
  // Har seed pe online status taaza karo, taaki Discover me online log dikhein
  await user.update({ lastSeenAt: minutesAgo(seenMinAgo) }, { silent: true });
  seeded.push(user);
}
console.log(`👤 Seed users: ${seeded.length + 1}`);

// 3. Sample photos (avatar + album). Sirf jinke paas abhi photos nahi hain.
const PALETTES = [
  ['#ff9bbb', '#a3164a', '#5c0c2c'],
  ['#f6dc9b', '#a87a2a', '#5e4012'],
  ['#c9a0ff', '#6a2bb0', '#3c1470'],
  ['#ffb08f', '#c2402a', '#6d1c10'],
  ['#8fd3ff', '#2a5bb0', '#13306b'],
  ['#9ff0d0', '#1f8a6a', '#0d4535'],
];

function sampleSvg(seed: number, label: string): Buffer {
  const [a, b, ink] = PALETTES[seed % PALETTES.length];
  const angle = (seed * 47) % 360;
  const bokeh = Array.from({ length: 9 }, (_, i) => {
    const x = (seed * 131 + i * 211) % 1080;
    const y = (seed * 71 + i * 157) % 900;
    const r = 30 + ((seed + i * 13) % 90);
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" opacity="${0.05 + ((i * 7) % 10) / 100}"/>`;
  }).join('');
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350">
    <defs>
      <linearGradient id="g" gradientTransform="rotate(${angle} .5 .5)"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>
      <radialGradient id="v" cx=".5" cy=".4" r=".75"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></radialGradient>
    </defs>
    <rect width="1080" height="1350" fill="url(#g)"/>
    ${bokeh}
    <circle cx="540" cy="560" r="210" fill="${ink}" opacity=".85"/>
    <path d="M110 1350c0-300 190-500 430-500s430 200 430 500z" fill="${ink}" opacity=".85"/>
    <rect width="1080" height="1350" fill="url(#v)"/>
    <text x="540" y="1290" font-family="Arial" font-size="34" font-weight="700" fill="#fff" fill-opacity=".55" text-anchor="middle" letter-spacing="6">SAMPLE · ${label.toUpperCase()}</text>
  </svg>`);
}

let photoCount = 0;
for (const user of seeded) {
  if ((await UserPhoto.count({ where: { userId: user.id } })) > 0) continue;
  const n = user.gender === 'female' ? 5 : 3;
  for (let k = 0; k < n; k++) {
    const path = await saveImage(await sharp(sampleSvg(user.publicId + k * 3, user.name!)).png().toBuffer(), 'seed', `${user.publicId}-${k}`);
    const url = env.PUBLIC_BASE_URL + path;
    // Female users ki aakhri photo private (locked) — unlock feature baad me
    await UserPhoto.create({ userId: user.id, url, isLocked: user.gender === 'female' && k === n - 1, position: k });
    if (k === 0 && !user.avatarUrl) await user.update({ avatarUrl: url }, { silent: true });
    photoCount++;
  }
}
console.log(`🖼️  Sample photos: ${photoCount}`);

// 4. Gifts received (sirf pehli baar)
if ((await GiftTransaction.count()) === 0) {
  const txs = [];
  for (const receiver of seeded.filter(u => u.gender === 'female')) {
    const n = 6 + Math.floor(rand() * 10);
    for (let k = 0; k < n; k++) {
      const sender = pick(seeded.filter(u => u.id !== receiver.id));
      const gift = rand() < 0.15 ? pick(gifts.filter(g => g.isRare)) : pick(gifts.filter(g => !g.isRare));
      const quantity = gift.isRare ? 1 : 1 + Math.floor(rand() * 20);
      txs.push({ senderId: sender.id, receiverId: receiver.id, giftId: gift.id, quantity, totalPrice: quantity * gift.price });
    }
  }
  await GiftTransaction.bulkCreate(txs);
  console.log(`💝 Gift transactions: ${txs.length}`);
}

// 5. Follows (seed users ek doosre ko)
if ((await Follow.count({ where: { followerId: seeded.map(u => u.id) } })) === 0) {
  const rows = [];
  for (const a of seeded) {
    for (const b of seeded) {
      if (a.id !== b.id && rand() < 0.35) rows.push({ followerId: a.id, followingId: b.id });
    }
  }
  await Follow.bulkCreate(rows, { ignoreDuplicates: true });
  console.log(`➕ Follows: ${rows.length}`);
}

await sequelize.close();
console.log('✅ Seed done');

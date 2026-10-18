// Pehla (ya naya) admin banana — terminal se. Password yahin type hota hai, kahin save / print nahi hota.
//   npm run admin:create -- owner@meto.app "Shubham" owner
import { createInterface } from 'node:readline';
import { sequelize } from '../db/sequelize.js';
import { ensureColumns } from '../db/migrate.js';
import { hashPassword, passwordProblem } from '../lib/adminAuth.js';
import { Admin, ADMIN_ROLES, type AdminRole } from '../models/index.js';

const [email, name, role = 'owner'] = process.argv.slice(2);
if (!email || !name || !(ADMIN_ROLES as readonly string[]).includes(role)) {
  console.log('Usage: npm run admin:create -- <email> "<name>" [owner|moderator|support|finance]');
  process.exit(1);
}

// Password chhupa ke padho (screen pe * dikhe)
function askHidden(q: string): Promise<string> {
  return new Promise(res => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const out = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
    let shown = false;
    out._writeToOutput = (s: string) => {
      if (!shown) {
        out.output.write(s);
        shown = true;
      } else if (s.includes('\n') || s.includes('\r')) out.output.write('\n');
      else out.output.write('*');
    };
    rl.question(q, a => {
      rl.close();
      res(a);
    });
  });
}

await sequelize.authenticate();
await ensureColumns();
await Admin.sync();
const pw = await askHidden('Password (10+ chars, letters + numbers): ');
const problem = passwordProblem(pw);
if (problem) {
  console.log(`✗ ${problem}`);
  process.exit(1);
}
const again = await askHidden('Type it again: ');
if (again !== pw) {
  console.log('✗ Passwords do not match');
  process.exit(1);
}
const e = email.toLowerCase();
const existing = await Admin.findOne({ where: { email: e } });
if (existing) {
  await existing.update({ passwordHash: await hashPassword(pw), role: role as AdminRole, name, status: 'active', failedLogins: 0, lockedUntil: null });
  console.log(`✓ Updated admin ${e} (${role})`);
} else {
  await Admin.create({ email: e, name, role: role as AdminRole, passwordHash: await hashPassword(pw) });
  console.log(`✓ Created admin ${e} (${role})`);
}
await sequelize.close();

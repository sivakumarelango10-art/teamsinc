import pg from 'pg';
import fs from 'fs';

const envContent = fs.readFileSync('.env', 'utf-8');
let conn = '';
for (const line of envContent.split('\n')) {
  if (line.trim().startsWith('DIRECT_URL=')) {
    conn = line.trim().replace(/^DIRECT_URL=/, '').replace(/^["']|["']$/g, '');
  }
}

const client = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });

async function run() {
  await client.connect();
  console.log('Connected to DB!');

  // Get departments
  const deptsRes = await client.query("SELECT id, name FROM public.departments");
  const depts = {};
  deptsRes.rows.forEach(d => { depts[d.name] = d.id; });

  // Get profiles
  const profilesRes = await client.query("SELECT id, email, full_name FROM public.profiles");
  const profiles = {};
  profilesRes.rows.forEach(p => { profiles[p.email.toLowerCase()] = p.id; });

  console.log('Available departments:', Object.keys(depts));
  console.log('Available profiles count:', Object.keys(profiles).length);

  // Mapping of default department responsibilities
  const assignments = [
    // Development
    { email: 'prajith.p.dev.1@gmail.com', dept: 'Development' },
    { email: 'alinasyedali786@gmail.com', dept: 'Development' },
    { email: 'yashas1325143@gmail.com', dept: 'Development' },
    // Designing
    { email: 'sgjitbros@gmail.com', dept: 'Designing' },
    { email: 'ishitadas8889@gmail.com', dept: 'Designing' },
    // Testing
    { email: 'kavyaramesh293@gmail.com', dept: 'Testing' },
    { email: 'mohanapriyag143@gmail.com', dept: 'Testing' },
    // Production Support
    { email: 'alinasyedali786@gmail.com', dept: 'Production Support & Diagnostics' },
    { email: 'kavyaramesh293@gmail.com', dept: 'Production Support & Diagnostics' }
  ];

  for (const item of assignments) {
    const userId = profiles[item.email.toLowerCase()];
    const deptId = depts[item.dept];
    if (userId && deptId) {
      await client.query(`
        INSERT INTO public.department_members (department_id, user_id)
        VALUES ($1, $2)
        ON CONFLICT (department_id, user_id) DO NOTHING
      `, [deptId, userId]);
      console.log(`Assigned ${item.email} to ${item.dept}`);
    }
  }

  const check = await client.query(`
    SELECT dm.*, d.name as dept_name, p.full_name 
    FROM public.department_members dm 
    JOIN public.departments d ON dm.department_id = d.id 
    JOIN public.profiles p ON dm.user_id = p.id
  `);
  console.log('\nTotal active department_members in DB:', check.rows.length);
  console.table(check.rows.map(r => ({ Name: r.full_name, Department: r.dept_name })));

  await client.end();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});

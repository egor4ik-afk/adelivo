require('dotenv').config();

const actId = 16488506; // <- поменяй на свой
const token = process.env.KONSOL_API_KEY;

async function run() {
  const signRes = await fetch('https://api.konsol.pro/v2/acts/sign', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: [actId] })
  });
  console.log('SIGN:', await signRes.text());

  const payRes = await fetch('https://api.konsol.pro/v2/acts/autopay', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: [actId] })
  });
  console.log('AUTOPAY:', await payRes.text());
}

run();
require('dotenv').config();
const API_KEY = process.env.BSALE_API_KEY;
async function main() {
  const docs = [488276, 488348, 488597, 488637, 488651, 488478];
  for (const id of docs) {
    try {
      const url = `https://api.bsale.io/v1/documents/${id}.json`;
      const resp = await fetch(url, { headers: { 'access_token': API_KEY } });
      const json = await resp.json();
      const gen = json.generationDate;
      const emit = json.emissionDate;
      const num = json.number;
      const total = json.totalAmount;
      const d = new Date(gen * 1000);
      const dCL = new Date(d.getTime() - 3*3600000); // UTC-3 Chile
      const dia = dCL.toISOString().split('T')[0];
      const hora = dCL.toISOString().split('T')[1].substring(0,5);
      console.log(`#${num}(${id}) total=$ ${total} emision=${emit} generacion=${gen} => ${dia} ${hora} UTC-3 [genDateStr=${dCL.toISOString()}]`);
    } catch(e) {
      console.log(`doc ${id} error:`, e.message);
    }
  }
}
main();

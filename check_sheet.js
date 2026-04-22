const { google } = require("googleapis");
const auth = new google.auth.GoogleAuth({
    keyFile: "google-key.json",
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });

async function check() {
    try {
        const res = await sheets.spreadsheets.values.get({
            spreadsheetId: "1GZWhwHU_dVKqBmogCUUSbXStzGlR3KICU3l9Rm6C7JQ",
            range: "???!U10:W12"
        });
        console.log(res.data.values);
    } catch(e) { console.error(e); }
}
check();

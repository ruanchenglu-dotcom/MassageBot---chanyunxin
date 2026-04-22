require("dotenv").config();
const { google } = require("googleapis");
const auth = new google.auth.GoogleAuth({
    keyFile: "google-key.json",
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });

async function check() {
    try {
        const res = await sheets.spreadsheets.values.get({
            spreadsheetId: process.env.SHEET_ID,
            range: `${process.env.BOOKING_SHEET_NAME}!A10:Z12`
        });
        console.log(res.data.values.map(r => r.slice(20, 23)));
    } catch(e) { console.error(e); }
}
check();

const { google } = require('googleapis');
const path = require('path');
const configPath = path.join('C:\\MassageBot - chanyunxin', 'key.json');
const auth = new google.auth.GoogleAuth({ keyFile: configPath, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
const sheets = google.sheets({ version: 'v4', auth });
sheets.spreadsheets.values.get({ spreadsheetId: '12i4Ff6oXJtZ1B1r2x3K4R5p6s7L8g9M0N1o2Q3R', range: '???!V4' }).then(res => console.log(res.data.values));

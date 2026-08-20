const CoreAPI = require('./cyx_resource_core.js');

const mockStaff = {
  'T1': { id: 'T1', name: '王', group: '本館', gender: 'M', isYouTui: false, startMins: 0, endMins: 1440, off: false, isWorking: true }
};

const guestList = [{
  serviceCode: 'B2',
  staffName: 'T1',
  isYouTui: true,
  duration: 60
}];

const res = CoreAPI.checkRequestAvailability('2026/10/10', '12:00', guestList, [], mockStaff, { location: '本館' });
console.log(res);


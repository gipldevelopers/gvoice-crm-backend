const { google } = require("googleapis");

const getCalendarClient = (auth) => {
  return google.calendar({ version: "v3", auth });
};

const createEvent = async (auth, eventData) => {
  const calendar = getCalendarClient(auth);
  const response = await calendar.events.insert({
    calendarId: "primary",
    requestBody: eventData,
  });

  return response.data;
};

const listEvents = async (auth) => {
  const calendar = getCalendarClient(auth);
  const response = await calendar.events.list({
    calendarId: "primary",
    singleEvents: true,
    orderBy: "startTime",
    timeMin: new Date().toISOString(),
  });

  return response.data.items || [];
};

module.exports = {
  getCalendarClient,
  createEvent,
  listEvents,
};

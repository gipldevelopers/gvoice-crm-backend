const { google } = require("googleapis");

const getDriveClient = (auth) => {
  return google.drive({ version: "v3", auth });
};

const listFiles = async (auth) => {
  const drive = getDriveClient(auth);
  const response = await drive.files.list({
    pageSize: 20,
    fields: "files(id, name, mimeType, createdTime)",
  });

  return response.data.files || [];
};

const createFolder = async (auth, folderName) => {
  const drive = getDriveClient(auth);
  const response = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
    },
    fields: "id, name, mimeType",
  });

  return response.data;
};

module.exports = {
  getDriveClient,
  listFiles,
  createFolder,
};

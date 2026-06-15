const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const logger = require('../logger');

class GoogleDriveClient {
  constructor(auth) {
    this.drive = google.drive({ version: 'v3', auth });
  }

  static async createAuthClient(secretPath, tokenPath) {
    const secret = JSON.parse(fs.readFileSync(secretPath));
    const { client_id, client_secret, redirect_uris } = secret.installed || secret.web;
    const oAuth2 = new google.auth.OAuth2(client_id, client_secret, (redirect_uris || ['http://localhost'])[0]);

    if (fs.existsSync(tokenPath)) {
      oAuth2.setCredentials(JSON.parse(fs.readFileSync(tokenPath)));
    } else {
      throw new Error(
        'Google token not found. Run `node src/auth/google-auth.js` to authorise.'
      );
    }
    return oAuth2;
  }

  async ensureFolder(name, parentId) {
    const res = await this.drive.files.list({
      q: `name='${name}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`,
      fields: 'files(id,name)',
    });
    if (res.data.files.length) return res.data.files[0].id;

    const folder = await this.drive.files.create({
      requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
      fields: 'id',
    });
    return folder.data.id;
  }

  async uploadFile(filePath, parentFolderId, mimeType = 'application/zip') {
    const name = path.basename(filePath);
    const size = fs.statSync(filePath).size;
    logger.info(`Uploading ${name} (${(size / 1024 / 1024).toFixed(2)} MB)`);

    const res = await this.drive.files.create({
      requestBody: { name, parents: [parentFolderId] },
      media: { mimeType, body: fs.createReadStream(filePath) },
      fields: 'id,name,size,webViewLink',
    });
    logger.info(`Uploaded ${name} → ${res.data.webViewLink}`);
    return res.data;
  }

  async uploadJson(name, data, parentFolderId) {
    const content = JSON.stringify(data, null, 2);
    const { Readable } = require('stream');
    const res = await this.drive.files.create({
      requestBody: { name, parents: [parentFolderId], mimeType: 'application/json' },
      media: { mimeType: 'application/json', body: Readable.from([content]) },
      fields: 'id,name,webViewLink',
    });
    return res.data;
  }

  async listBackups(rootFolderId) {
    const res = await this.drive.files.list({
      q: `'${rootFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id,name,createdTime)',
      orderBy: 'createdTime desc',
    });
    return res.data.files;
  }

  async listFolderContents(folderId) {
    const res = await this.drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: 'files(id,name,mimeType,size,createdTime,webViewLink)',
      orderBy: 'name',
    });
    return res.data.files;
  }

  async downloadFile(fileId, destPath) {
    const dest = fs.createWriteStream(destPath);
    const res = await this.drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' });
    await new Promise((resolve, reject) => {
      res.data.pipe(dest).on('finish', resolve).on('error', reject);
    });
    return destPath;
  }

  async deleteFile(fileId) {
    await this.drive.files.delete({ fileId });
  }
}

module.exports = GoogleDriveClient;

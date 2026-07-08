const forge = require('node-forge');
const fs = require('fs');
const path = require('path');

const keys = forge.pki.rsa.generateKeyPair(2048);
const cert = forge.pki.createCertificate();

cert.publicKey = keys.publicKey;
cert.serialNumber = '01' + forge.util.bytesToHex(forge.random.getBytesSync(7));
const now = new Date();
cert.validity.notBefore = now;
cert.validity.notAfter = new Date(now.getTime() + 10 * 365 * 24 * 60 * 60 * 1000);

const attrs = [{ name: 'commonName', value: 'localhost' }];
cert.setSubject(attrs);
cert.setIssuer(attrs);

cert.setExtensions([
  { name: 'basicConstraints', cA: false },
  { name: 'subjectAltName', altNames: [{ type: 2, value: 'localhost' }, { type: 2, value: '127.0.0.1' }] },
  { name: 'keyUsage', keyCertSign: true, digitalSignature: true, keyEncipherment: true },
  { name: 'extKeyUsage', serverAuth: true }
]);

cert.sign(keys.privateKey, forge.md.sha256.create());

const certPem = forge.pki.certificateToPem(cert);
const keyPem = forge.pki.privateKeyToPem(keys.privateKey);

fs.writeFileSync(path.resolve(__dirname, '..', 'server.cert'), certPem);
fs.writeFileSync(path.resolve(__dirname, '..', 'server.key'), keyPem);
console.log('Generated server.key and server.cert');

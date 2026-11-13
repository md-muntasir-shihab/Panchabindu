import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import { syncBuiltinESMExports } from 'node:module';

const fixture = process.env.PANCHAGARH_UNIT_FIXTURE;
assert.ok(fixture, 'Tests must run through the isolated fixture runner');
assert.equal(process.cwd(), fixture);
assert.equal(fs.lstatSync(path.join(fixture, '.data')).isSymbolicLink(), false);
const denyNetwork = () => { throw new Error('External network is forbidden in isolated unit tests'); };
globalThis.fetch = async () => denyNetwork();
http.request = http.get = https.request = https.get = denyNetwork;
net.connect = net.createConnection = tls.connect = denyNetwork;
net.Socket.prototype.connect = denyNetwork;
syncBuiltinESMExports();

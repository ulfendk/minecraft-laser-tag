// Turns on the Beta APIs experiment in a Bedrock world's level.dat, so a test-only pack
// can use @minecraft/server-gametest (simulated players). Used by tools/bds-player.sh.
// level.dat: an int version, an int length, then little-endian NBT.
// Usage: node tools/level-dat.mjs <path/to/level.dat>
import fs from 'node:fs';

const T = { end: 0, byte: 1, short: 2, int: 3, long: 4, float: 5, double: 6, byteArray: 7, string: 8, list: 9, compound: 10, intArray: 11, longArray: 12 };

function read(buf) {
  let o = 0;
  const str = () => {
    const n = buf.readUInt16LE(o);
    o += 2;
    const s = buf.toString('utf8', o, o + n);
    o += n;
    return s;
  };
  const payload = (type) => {
    switch (type) {
      case T.byte: return { type, value: buf.readInt8(o++) };
      case T.short: o += 2; return { type, value: buf.readInt16LE(o - 2) };
      case T.int: o += 4; return { type, value: buf.readInt32LE(o - 4) };
      case T.long: o += 8; return { type, value: buf.readBigInt64LE(o - 8) };
      case T.float: o += 4; return { type, value: buf.readFloatLE(o - 4) };
      case T.double: o += 8; return { type, value: buf.readDoubleLE(o - 8) };
      case T.string: return { type, value: str() };
      case T.byteArray: case T.intArray: case T.longArray: {
        const n = buf.readInt32LE(o);
        o += 4;
        const size = type === T.byteArray ? 1 : type === T.intArray ? 4 : 8;
        const value = buf.subarray(o, o + n * size);
        o += n * size;
        return { type, n, value };
      }
      case T.list: {
        const itemType = buf.readInt8(o++);
        const n = buf.readInt32LE(o);
        o += 4;
        const items = [];
        for (let i = 0; i < n; i++) items.push(payload(itemType));
        return { type, itemType, items };
      }
      case T.compound: {
        const value = new Map();
        for (;;) {
          const t = buf.readInt8(o++);
          if (t === T.end) break;
          const name = str();
          value.set(name, payload(t));
        }
        return { type, value };
      }
      default: throw new Error(`NBT tag type ${type} at ${o}`);
    }
  };
  const t = buf.readInt8(o++);
  const name = str();
  return { name, root: payload(t) };
}

function write({ name, root }) {
  const parts = [];
  const push = (b) => parts.push(b);
  const num = (size, fn, v) => {
    const b = Buffer.alloc(size);
    b[fn](v);
    push(b);
  };
  const str = (s) => {
    const d = Buffer.from(s, 'utf8');
    num(2, 'writeUInt16LE', d.length);
    push(d);
  };
  const payload = (tag) => {
    switch (tag.type) {
      case T.byte: return num(1, 'writeInt8', tag.value);
      case T.short: return num(2, 'writeInt16LE', tag.value);
      case T.int: return num(4, 'writeInt32LE', tag.value);
      case T.long: return num(8, 'writeBigInt64LE', tag.value);
      case T.float: return num(4, 'writeFloatLE', tag.value);
      case T.double: return num(8, 'writeDoubleLE', tag.value);
      case T.string: return str(tag.value);
      case T.byteArray: case T.intArray: case T.longArray:
        num(4, 'writeInt32LE', tag.n);
        return push(tag.value);
      case T.list:
        num(1, 'writeInt8', tag.itemType);
        num(4, 'writeInt32LE', tag.items.length);
        return tag.items.forEach(payload);
      case T.compound:
        for (const [k, v] of tag.value) {
          num(1, 'writeInt8', v.type);
          str(k);
          payload(v);
        }
        return num(1, 'writeInt8', T.end);
      default: throw new Error(`NBT tag type ${tag.type}`);
    }
  };
  num(1, 'writeInt8', root.type);
  str(name);
  payload(root);
  return Buffer.concat(parts);
}

const file = process.argv[2];
const buf = fs.readFileSync(file);
const version = buf.readInt32LE(0);
const nbt = read(buf.subarray(8));
const on = { type: T.byte, value: 1 };
const experiments = nbt.root.value.get('experiments') ?? { type: T.compound, value: new Map() };
for (const k of ['gametest', 'experiments_ever_used', 'saved_with_toggled_experiments']) experiments.value.set(k, on);
nbt.root.value.set('experiments', experiments);
nbt.root.value.set('commandsEnabled', on);
const body = write(nbt);
const head = Buffer.alloc(8);
head.writeInt32LE(version, 0);
head.writeInt32LE(body.length, 4);
fs.writeFileSync(file, Buffer.concat([head, body]));
console.log(`${file}: Beta APIs on`);

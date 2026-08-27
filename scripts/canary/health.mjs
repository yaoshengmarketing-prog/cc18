import {queueStoreFromEnvironment} from '../queue/store.mjs';

const repair = process.argv.includes('--repair-expired');
const store = queueStoreFromEnvironment({mode: 'd1'});
const before = await store.queueHealth();
const repaired = repair ? await store.repairExpiredLeases() : [];
const after = repair ? await store.queueHealth() : before;
console.log(JSON.stringify({event: 'queue_health', repair_requested: repair, repaired_count: repaired.length, repaired, before, after}, null, 2));

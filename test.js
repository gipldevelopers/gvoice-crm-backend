const { Queue, Worker } = require("bullmq");

const connection = {
  host: "127.0.0.1",
  port: 6379
};

const queue = new Queue("demo", { connection });

new Worker(
  "demo",
  async job => {
    console.log("JOB EXECUTED:", job.data);
  },
  { connection }   // 👈 THIS WAS MISSING
);

queue.add(
  "email",
  { user: "ayush", msg: "hello after 10 sec" },
  { delay: 10 * 1000 }
);

console.log("Job scheduled...");

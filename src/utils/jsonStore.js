
const mongoose = require("mongoose");

const schema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    records: { type: [mongoose.Schema.Types.Mixed], default: [] },
  },
  { versionKey: false, collection: "app_collections" }
);

const Collection =
  mongoose.models.AppCollection ||
  mongoose.model("AppCollection", schema);

function validateName(name) {
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    throw new Error("Invalid collection name.");
  }

  if (mongoose.connection.readyState !== 1) {
    throw new Error("MongoDB is not connected.");
  }
}

async function readCollection(name) {
  validateName(name);

  const result = await Collection.findOne({ name }).lean();
  return result ? result.records : [];
}

async function writeCollection(name, records) {
  validateName(name);

  if (!Array.isArray(records)) {
    throw new Error("Records must be an array.");
  }

  await Collection.findOneAndUpdate(
    { name },
    { $set: { records } },
    { upsert: true, new: true, runValidators: true }
  );
}

module.exports = { readCollection, writeCollection };

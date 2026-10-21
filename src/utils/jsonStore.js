const fs = require("node:fs/promises");
const path = require("node:path");

const dataDirectory = path.join(__dirname, "../../data");

async function readCollection(name) {
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    throw new Error("Invalid collection name.");
  }

  await fs.mkdir(dataDirectory, { recursive: true });

  const filePath = path.join(dataDirectory, `${name}.json`);

  try {
    const content = await fs.readFile(filePath, "utf8");
    const records = JSON.parse(content);

    if (!Array.isArray(records)) {
      throw new Error(`${name}.json must contain a JSON array.`);
    }

    return records;
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }

    await writeCollection(name, []);
    return [];
  }
}

async function writeCollection(name, records) {
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    throw new Error("Invalid collection name.");
  }

  if (!Array.isArray(records)) {
    throw new Error("Records must be an array.");
  }

  await fs.mkdir(dataDirectory, { recursive: true });

  const filePath = path.join(dataDirectory, `${name}.json`);
  const temporaryPath = `${filePath}.tmp`;

  await fs.writeFile(
    temporaryPath,
    JSON.stringify(records, null, 2),
    "utf8"
  );

  await fs.rename(temporaryPath, filePath);
}

module.exports = {
  readCollection,
  writeCollection,
};

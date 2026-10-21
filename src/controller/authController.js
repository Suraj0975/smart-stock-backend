
const fs = require("node:fs/promises");
const path = require("node:path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { randomUUID } = require("node:crypto");

const dataDirectory = path.join(__dirname, "../../data");
const usersFile = path.join(dataDirectory, "users.json");

async function readUsers() {
  await fs.mkdir(dataDirectory, { recursive: true });

  try {
    const content = await fs.readFile(usersFile, "utf8");
    const users = JSON.parse(content);

    if (!Array.isArray(users)) {
      throw new Error("users.json must contain a JSON array.");
    }

    return users;
  } catch (error) {
    if (error.code === "ENOENT") {
      await fs.writeFile(usersFile, "[]", "utf8");
      return [];
    }

    throw error;
  }
}

async function saveUsers(users) {
  await fs.mkdir(dataDirectory, { recursive: true });

  await fs.writeFile(
    usersFile,
    JSON.stringify(users, null, 2),
    "utf8"
  );
}

function createToken(user) {
  const secret =
    process.env.JWT_SECRET ||
    (process.env.NODE_ENV !== "production"
      ? "smart-stock-local-development-secret"
      : "");

  if (!secret) {
    throw new Error("JWT_SECRET is missing from backend/.env");
  }

  return jwt.sign(
    { id: user.id, role: user.role },
    secret,
    { expiresIn: "7d" }
  );
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role
  };
}

exports.register = async (req, res) => {
  try {
    const { name, email, password } = req.body || {};

    if (
      typeof name !== "string" ||
      !name.trim() ||
      typeof email !== "string" ||
      !email.trim() ||
      typeof password !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "Name, email and password are required."
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters."
      });
    }

    const users = await readUsers();
    const normalizedEmail = email.trim().toLowerCase();

    if (users.some((user) => user.email === normalizedEmail)) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists."
      });
    }

    const user = {
      id: randomUUID(),
      name: name.trim(),
      email: normalizedEmail,
      password: await bcrypt.hash(password, 12),
      role: "employee",
      isActive: true,
      createdAt: new Date().toISOString()
    };

    users.push(user);
    await saveUsers(users);

    return res.status(201).json({
      success: true,
      message: "Account created successfully.",
      token: createToken(user),
      user: publicUser(user)
    });
  } catch (error) {
    console.error("Local registration error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to create account. Check the backend terminal."
    });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (
      typeof email !== "string" ||
      !email.trim() ||
      typeof password !== "string" ||
      !password
    ) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required."
      });
    }

    const users = await readUsers();

    const user = users.find(
      (item) => item.email === email.trim().toLowerCase()
    );

    if (
      !user ||
      !(await bcrypt.compare(password, user.password))
    ) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password."
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "This account is disabled."
      });
    }

    return res.json({
      success: true,
      message: "Login successful.",
      token: createToken(user),
      user: publicUser(user)
    });
  } catch (error) {
    console.error("Local login error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to log in. Check the backend terminal."
    });
  }
};

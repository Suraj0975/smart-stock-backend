const { randomUUID } = require("node:crypto");
const { readCollection, writeCollection } = require("../utils/jsonStore");

const now = () => new Date().toISOString();

exports.getSuppliers = async (req, res) => {
  try {
    const suppliers = (await readCollection("suppliers"))
      .filter((item) => item.isActive !== false)
      .sort((a, b) => a.name.localeCompare(b.name));

    res.json({ success: true, data: suppliers });
  } catch (error) {
    console.error("Get suppliers error:", error);
    res.status(500).json({ success: false, message: "Unable to load suppliers." });
  }
};

exports.createSupplier = async (req, res) => {
  try {
    const body = req.body || {};
    const name = typeof body.name === "string" ? body.name.trim() : "";

    if (!name) {
      return res.status(400).json({ success: false, message: "Supplier name is required." });
    }

    const suppliers = await readCollection("suppliers");
    const timestamp = now();

    const supplier = {
      _id: randomUUID(),
      name,
      company: typeof body.company === "string" ? body.company.trim() : "",
      contactPerson: typeof body.contactPerson === "string" ? body.contactPerson.trim() : "",
      email: typeof body.email === "string" ? body.email.trim() : "",
      phone: typeof body.phone === "string" ? body.phone.trim() : "",
      address: typeof body.address === "string" ? body.address.trim() : "",
      isActive: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    suppliers.push(supplier);
    await writeCollection("suppliers", suppliers);

    res.status(201).json({ success: true, message: "Supplier created successfully.", data: supplier });
  } catch (error) {
    console.error("Create supplier error:", error);
    res.status(500).json({ success: false, message: "Unable to create supplier." });
  }
};

exports.updateSupplier = async (req, res) => {
  try {
    const suppliers = await readCollection("suppliers");
    const index = suppliers.findIndex((item) => item._id === req.params.id && item.isActive !== false);

    if (index === -1) {
      return res.status(404).json({ success: false, message: "Supplier not found." });
    }

    const body = req.body || {};
    const fields = ["name", "company", "contactPerson", "email", "phone", "address"];
    const updated = { ...suppliers[index] };

    for (const field of fields) {
      if (typeof body[field] === "string") updated[field] = body[field].trim();
    }

    if (!updated.name) {
      return res.status(400).json({ success: false, message: "Supplier name is required." });
    }

    updated.updatedAt = now();
    suppliers[index] = updated;
    await writeCollection("suppliers", suppliers);

    res.json({ success: true, message: "Supplier updated successfully.", data: updated });
  } catch (error) {
    console.error("Update supplier error:", error);
    res.status(500).json({ success: false, message: "Unable to update supplier." });
  }
};

exports.deleteSupplier = async (req, res) => {
  try {
    const suppliers = await readCollection("suppliers");
    const index = suppliers.findIndex((item) => item._id === req.params.id && item.isActive !== false);

    if (index === -1) {
      return res.status(404).json({ success: false, message: "Supplier not found." });
    }

    suppliers[index].isActive = false;
    suppliers[index].updatedAt = now();
    await writeCollection("suppliers", suppliers);

    res.json({ success: true, message: "Supplier archived successfully." });
  } catch (error) {
    console.error("Delete supplier error:", error);
    res.status(500).json({ success: false, message: "Unable to archive supplier." });
  }
};

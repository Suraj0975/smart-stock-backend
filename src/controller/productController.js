const { randomUUID } = require("node:crypto");
const { readCollection, writeCollection } = require("../utils/jsonStore");

const now = () => new Date().toISOString();

function normalizeId(value) {
  if (value && typeof value === "object") return value._id || value.id || "";
  return value == null ? "" : String(value);
}

function presentProduct(product, categories, suppliers) {
  const categoryId = normalizeId(product.category);
  const supplierId = normalizeId(product.supplier);
  const category = categories.find((item) => item._id === categoryId);
  const supplier = suppliers.find((item) => item._id === supplierId);

  return {
    ...product,
    category: category ? { _id: category._id, name: category.name } : categoryId,
    supplier: supplier ? { _id: supplier._id, name: supplier.name, company: supplier.company, email: supplier.email } : (supplierId || null),
    reorderLevel: Number(product.reorderLevel ?? product.minStockLevel ?? 5),
    minStockLevel: Number(product.reorderLevel ?? product.minStockLevel ?? 5),
  };
}

function validNumber(value, label, integer = false) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || (integer && !Number.isInteger(number))) {
    throw new Error(`${label} must be a valid non-negative ${integer ? "integer" : "number"}.`);
  }
  return number;
}

exports.getProducts = async (req, res) => {
  try {
    const [products, categories, suppliers] = await Promise.all([
      readCollection("products"),
      readCollection("categories"),
      readCollection("suppliers"),
    ]);

    const result = products
      .filter((item) => item.isActive !== false)
      .map((item) => presentProduct(item, categories, suppliers))
      .sort((a, b) => a.name.localeCompare(b.name));

    res.json({ success: true, data: result });
  } catch (error) {
    console.error("Get products error:", error);
    res.status(500).json({ success: false, message: "Unable to load products." });
  }
};

exports.getProductById = async (req, res) => {
  try {
    const [products, categories, suppliers] = await Promise.all([
      readCollection("products"),
      readCollection("categories"),
      readCollection("suppliers"),
    ]);

    const product = products.find((item) => item._id === req.params.id && item.isActive !== false);

    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found." });
    }

    res.json({ success: true, data: presentProduct(product, categories, suppliers) });
  } catch (error) {
    console.error("Get product error:", error);
    res.status(500).json({ success: false, message: "Unable to load product." });
  }
};

exports.createProduct = async (req, res) => {
  try {
    const body = req.body || {};
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const sku = typeof body.sku === "string" ? body.sku.trim().toUpperCase() : "";
    const categoryId = normalizeId(body.category);
    const supplierId = normalizeId(body.supplier);

    if (!name || !sku || !categoryId) {
      return res.status(400).json({ success: false, message: "Product name, SKU and category are required." });
    }

    const [products, categories, suppliers] = await Promise.all([
      readCollection("products"),
      readCollection("categories"),
      readCollection("suppliers"),
    ]);

    if (products.some((item) => item.sku === sku && item.isActive !== false)) {
      return res.status(409).json({ success: false, message: "A product with this SKU already exists." });
    }

    if (!categories.some((item) => item._id === categoryId && item.isActive !== false)) {
      return res.status(400).json({ success: false, message: "Please select a valid category." });
    }

    if (supplierId && !suppliers.some((item) => item._id === supplierId && item.isActive !== false)) {
      return res.status(400).json({ success: false, message: "Please select a valid supplier." });
    }

    const costPrice = validNumber(body.costPrice ?? 0, "Cost price");
    const sellingPrice = validNumber(body.sellingPrice ?? 0, "Selling price");
    const quantity = validNumber(body.quantity ?? 0, "Quantity", true);
    const reorderLevel = validNumber(body.reorderLevel ?? body.minStockLevel ?? 5, "Reorder level", true);

    const timestamp = now();
    const product = {
      _id: randomUUID(),
      name,
      sku,
      category: categoryId,
      supplier: supplierId || null,
      description: typeof body.description === "string" ? body.description.trim() : "",
      costPrice,
      sellingPrice,
      quantity,
      reorderLevel,
      minStockLevel: reorderLevel,
      unit: typeof body.unit === "string" && body.unit.trim() ? body.unit.trim() : "unit",
      isActive: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    products.push(product);
    await writeCollection("products", products);

    res.status(201).json({
      success: true,
      message: "Product created successfully.",
      data: presentProduct(product, categories, suppliers),
    });
  } catch (error) {
    console.error("Create product error:", error);
    const clientError = /must be a valid non-negative/.test(error.message);
    res.status(clientError ? 400 : 500).json({
      success: false,
      message: clientError ? error.message : "Unable to create product.",
    });
  }
};

exports.updateProduct = async (req, res) => {
  try {
    const body = req.body || {};
    const [products, categories, suppliers] = await Promise.all([
      readCollection("products"),
      readCollection("categories"),
      readCollection("suppliers"),
    ]);

    const index = products.findIndex((item) => item._id === req.params.id && item.isActive !== false);

    if (index === -1) {
      return res.status(404).json({ success: false, message: "Product not found." });
    }

    const current = products[index];
    const updated = { ...current };

    if (body.name !== undefined) {
      if (typeof body.name !== "string" || !body.name.trim()) {
        return res.status(400).json({ success: false, message: "Product name is required." });
      }
      updated.name = body.name.trim();
    }

    if (body.sku !== undefined) {
      if (typeof body.sku !== "string" || !body.sku.trim()) {
        return res.status(400).json({ success: false, message: "SKU is required." });
      }
      updated.sku = body.sku.trim().toUpperCase();
    }

    if (products.some((item, i) => i !== index && item.sku === updated.sku && item.isActive !== false)) {
      return res.status(409).json({ success: false, message: "A product with this SKU already exists." });
    }

    if (body.category !== undefined) {
      const categoryId = normalizeId(body.category);
      if (!categories.some((item) => item._id === categoryId && item.isActive !== false)) {
        return res.status(400).json({ success: false, message: "Please select a valid category." });
      }
      updated.category = categoryId;
    }

    if (body.supplier !== undefined) {
      const supplierId = normalizeId(body.supplier);
      if (supplierId && !suppliers.some((item) => item._id === supplierId && item.isActive !== false)) {
        return res.status(400).json({ success: false, message: "Please select a valid supplier." });
      }
      updated.supplier = supplierId || null;
    }

    if (body.description !== undefined) {
      updated.description = typeof body.description === "string" ? body.description.trim() : "";
    }

    for (const field of ["costPrice", "sellingPrice"]) {
      if (body[field] !== undefined) updated[field] = validNumber(body[field], field);
    }

    if (body.quantity !== undefined) {
      updated.quantity = validNumber(body.quantity, "Quantity", true);
    }

    if (body.reorderLevel !== undefined || body.minStockLevel !== undefined) {
      const value = body.reorderLevel ?? body.minStockLevel;
      updated.reorderLevel = validNumber(value, "Reorder level", true);
      updated.minStockLevel = updated.reorderLevel;
    }

    updated.updatedAt = now();
    products[index] = updated;
    await writeCollection("products", products);

    res.json({
      success: true,
      message: "Product updated successfully.",
      data: presentProduct(updated, categories, suppliers),
    });
  } catch (error) {
    console.error("Update product error:", error);
    const clientError = /must be a valid non-negative/.test(error.message);
    res.status(clientError ? 400 : 500).json({
      success: false,
      message: clientError ? error.message : "Unable to update product.",
    });
  }
};

exports.deleteProduct = async (req, res) => {
  try {
    const products = await readCollection("products");
    const index = products.findIndex((item) => item._id === req.params.id && item.isActive !== false);

    if (index === -1) {
      return res.status(404).json({ success: false, message: "Product not found." });
    }

    products[index].isActive = false;
    products[index].updatedAt = now();
    await writeCollection("products", products);

    res.json({ success: true, message: "Product archived successfully." });
  } catch (error) {
    console.error("Delete product error:", error);
    res.status(500).json({ success: false, message: "Unable to archive product." });
  }
};

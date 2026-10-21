const { randomUUID } = require("node:crypto");
const { readCollection, writeCollection } = require("../utils/jsonStore");

const now = () => new Date().toISOString();

exports.getCategories = async (req, res) => {
  try {
    const categories = (await readCollection("categories"))
      .filter((item) => item.isActive !== false)
      .sort((a, b) => a.name.localeCompare(b.name));

    res.json({ success: true, data: categories });
  } catch (error) {
    console.error("Get categories error:", error);
    res.status(500).json({ success: false, message: "Unable to load categories." });
  }
};

exports.createCategory = async (req, res) => {
  try {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const description = typeof req.body?.description === "string" ? req.body.description.trim() : "";

    if (!name) {
      return res.status(400).json({ success: false, message: "Category name is required." });
    }

    const categories = await readCollection("categories");

    if (categories.some((item) => item.isActive !== false && item.name.toLowerCase() === name.toLowerCase())) {
      return res.status(409).json({ success: false, message: "A category with this name already exists." });
    }

    const timestamp = now();
    const category = {
      _id: randomUUID(),
      name,
      description,
      isActive: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    categories.push(category);
    await writeCollection("categories", categories);

    res.status(201).json({ success: true, message: "Category created successfully.", data: category });
  } catch (error) {
    console.error("Create category error:", error);
    res.status(500).json({ success: false, message: "Unable to create category." });
  }
};

exports.updateCategory = async (req, res) => {
  try {
    const categories = await readCollection("categories");
    const index = categories.findIndex((item) => item._id === req.params.id && item.isActive !== false);

    if (index === -1) {
      return res.status(404).json({ success: false, message: "Category not found." });
    }

    const name = typeof req.body?.name === "string" ? req.body.name.trim() : categories[index].name;
    const description = typeof req.body?.description === "string" ? req.body.description.trim() : categories[index].description;

    if (!name) {
      return res.status(400).json({ success: false, message: "Category name is required." });
    }

    if (categories.some((item, i) => i !== index && item.isActive !== false && item.name.toLowerCase() === name.toLowerCase())) {
      return res.status(409).json({ success: false, message: "A category with this name already exists." });
    }

    categories[index] = { ...categories[index], name, description, updatedAt: now() };
    await writeCollection("categories", categories);

    res.json({ success: true, message: "Category updated successfully.", data: categories[index] });
  } catch (error) {
    console.error("Update category error:", error);
    res.status(500).json({ success: false, message: "Unable to update category." });
  }
};

exports.deleteCategory = async (req, res) => {
  try {
    const categories = await readCollection("categories");
    const category = categories.find((item) => item._id === req.params.id && item.isActive !== false);

    if (!category) {
      return res.status(404).json({ success: false, message: "Category not found." });
    }

    const products = await readCollection("products");
    const inUse = products.some((product) =>
      product.isActive !== false &&
      (product.category === category._id || product.category?._id === category._id)
    );

    if (inUse) {
      return res.status(409).json({ success: false, message: "This category is assigned to products. Reassign or remove those products first." });
    }

    category.isActive = false;
    category.updatedAt = now();
    await writeCollection("categories", categories);

    res.json({ success: true, message: "Category deleted successfully." });
  } catch (error) {
    console.error("Delete category error:", error);
    res.status(500).json({ success: false, message: "Unable to delete category." });
  }
};

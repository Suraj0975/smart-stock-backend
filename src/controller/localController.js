const { randomUUID } = require("node:crypto");
const bcrypt = require("bcryptjs");
const { readCollection, writeCollection } = require("../utils/jsonStore");

const now = () => new Date().toISOString();
const idOf = (value) => value && typeof value === "object"
  ? String(value._id || value.id || "")
  : String(value || "");

function publicUser(user) {
  const { password, ...safe } = user;
  return safe;
}

function number(value, label, integer = false) {
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0 || (integer && !Number.isInteger(result))) {
    throw new Error(`${label} must be a valid non-negative ${integer ? "integer" : "number"}.`);
  }
  return result;
}

function errorResponse(res, error, label) {
  console.error(`${label}:`, error);
  const clientError = /must be a valid non-negative/.test(error.message);
  res.status(clientError ? 400 : 500).json({
    success: false,
    message: clientError ? error.message : `Unable to ${label.toLowerCase()}.`,
  });
}

// USERS
exports.getUsers = async (req, res) => {
  try {
    const users = (await readCollection("users"))
      .filter((user) => user.isActive !== false)
      .map(publicUser);
    res.json({ success: true, data: users });
  } catch (e) { errorResponse(res, e, "Load users"); }
};

exports.getUserById = async (req, res) => {
  try {
    const user = (await readCollection("users"))
      .find((item) => item.id === req.params.id || item._id === req.params.id);
    if (!user || user.isActive === false) {
      return res.status(404).json({ success: false, message: "User not found." });
    }
    res.json({ success: true, data: publicUser(user) });
  } catch (e) { errorResponse(res, e, "Load user"); }
};

exports.createUser = async (req, res) => {
  try {
    const body = req.body || {};
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!name || !email || password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Name, email and a password of at least 8 characters are required.",
      });
    }

    const users = await readCollection("users");
    if (users.some((u) => u.email === email)) {
      return res.status(409).json({ success: false, message: "An account with this email already exists." });
    }

    const timestamp = now();
    const user = {
      id: randomUUID(),
      _id: randomUUID(),
      name,
      email,
      password: await bcrypt.hash(password, 12),
      role: ["admin", "manager", "employee"].includes(body.role) ? body.role : "employee",
      isActive: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    users.push(user);
    await writeCollection("users", users);
    res.status(201).json({ success: true, message: "User created successfully.", data: publicUser(user) });
  } catch (e) { errorResponse(res, e, "Create user"); }
};

exports.updateUser = async (req, res) => {
  try {
    const users = await readCollection("users");
    const index = users.findIndex((u) => u.id === req.params.id || u._id === req.params.id);
    if (index < 0 || users[index].isActive === false) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    const body = req.body || {};
    const user = { ...users[index] };

    if (typeof body.name === "string" && body.name.trim()) user.name = body.name.trim();
    if (typeof body.email === "string" && body.email.trim()) {
      const email = body.email.trim().toLowerCase();
      if (users.some((u, i) => i !== index && u.email === email)) {
        return res.status(409).json({ success: false, message: "That email is already in use." });
      }
      user.email = email;
    }
    if (["admin", "manager", "employee"].includes(body.role)) user.role = body.role;
    if (typeof body.password === "string" && body.password) {
      if (body.password.length < 8) {
        return res.status(400).json({ success: false, message: "Password must be at least 8 characters." });
      }
      user.password = await bcrypt.hash(body.password, 12);
    }

    user.updatedAt = now();
    users[index] = user;
    await writeCollection("users", users);
    res.json({ success: true, message: "User updated successfully.", data: publicUser(user) });
  } catch (e) { errorResponse(res, e, "Update user"); }
};

exports.deleteUser = async (req, res) => {
  try {
    const users = await readCollection("users");
    const index = users.findIndex((u) => u.id === req.params.id || u._id === req.params.id);
    if (index < 0 || users[index].isActive === false) {
      return res.status(404).json({ success: false, message: "User not found." });
    }
    users[index].isActive = false;
    users[index].updatedAt = now();
    await writeCollection("users", users);
    res.json({ success: true, message: "User deactivated successfully." });
  } catch (e) { errorResponse(res, e, "Deactivate user"); }
};

// SALES
exports.getSales = async (req, res) => {
  try {
    const sales = (await readCollection("sales"))
      .sort((a, b) =>
        String(b.createdAt).localeCompare(String(a.createdAt))
      );

    res.json({ success: true, data: sales });
  } catch (error) {
    errorResponse(res, error, "Load sales");
  }
};

exports.getSaleById = async (req, res) => {
  try {
    const sales = await readCollection("sales");
    const sale = sales.find(
      (item) =>
        item._id === req.params.id ||
        item.invoiceNumber === req.params.id
    );

    if (!sale) {
      return res.status(404).json({
        success: false,
        message: "Sale or invoice not found.",
      });
    }

    res.json({ success: true, data: sale });
  } catch (error) {
    errorResponse(res, error, "Load sale");
  }
};

exports.createSale = async (req, res) => {
  let originalProducts = null;
  let productsWereSaved = false;

  try {
    const body = req.body || {};

    if (!Array.isArray(body.items) || body.items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "A sale must contain at least one item.",
      });
    }

    const [sales, products] = await Promise.all([
      readCollection("sales"),
      readCollection("products"),
    ]);

    originalProducts = products.map((product) => ({ ...product }));

    const productMap = new Map(
      products.map((product) => [idOf(product), product])
    );

    const requestedItems = new Map();

    // Validate items and combine duplicate product lines.
    for (const item of body.items) {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return res.status(400).json({
          success: false,
          message: "Each sale item must be a valid object.",
        });
      }

      const productId = idOf(
        item.productId || item.product || item._id
      );

      const product = productMap.get(productId);

      if (!product || product.isActive === false) {
        return res.status(400).json({
          success: false,
          message: "A selected product was not found or is inactive.",
        });
      }

      const quantity = Number(item.quantity);

      if (!Number.isSafeInteger(quantity) || quantity <= 0) {
        return res.status(400).json({
          success: false,
          message: "Quantity must be a positive whole number.",
        });
      }

      const defaultPrice = product.sellingPrice ?? product.price;
      const rawPrice =
        item.unitPrice ??
        item.sellingPrice ??
        item.price ??
        defaultPrice;

      if (
        rawPrice === undefined ||
        rawPrice === null ||
        rawPrice === ""
      ) {
        return res.status(400).json({
          success: false,
          message: `Selling price is missing for ${product.name || productId}.`,
        });
      }

      const unitPrice = Number(rawPrice);

      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        return res.status(400).json({
          success: false,
          message: `Invalid selling price for ${product.name || productId}.`,
        });
      }

      const previous = requestedItems.get(productId);

      if (previous && previous.unitPrice !== unitPrice) {
        return res.status(400).json({
          success: false,
          message: `Duplicate lines for ${product.name || productId} must use the same selling price.`,
        });
      }

      const combinedQuantity =
        (previous?.quantity || 0) + quantity;

      if (!Number.isSafeInteger(combinedQuantity)) {
        return res.status(400).json({
          success: false,
          message: "Combined quantity is too large.",
        });
      }

      requestedItems.set(productId, {
        product,
        quantity: combinedQuantity,
        unitPrice,
      });
    }

    // Check ALL stock before modifying any product.
    for (const [productId, entry] of requestedItems) {
      const available = Number(entry.product.quantity ?? 0);

      if (!Number.isSafeInteger(available) || available < 0) {
        return res.status(400).json({
          success: false,
          message: `Invalid stock quantity for ${entry.product.name || productId}.`,
        });
      }

      if (available < entry.quantity) {
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for ${entry.product.name || productId}. Available: ${available}; requested: ${entry.quantity}.`,
        });
      }
    }

    const items = [];
    let subtotal = 0;
    let profitBeforeDiscount = 0;

    for (const [productId, entry] of requestedItems) {
      const { product, quantity, unitPrice } = entry;

      const costPrice = Number(
        product.costPrice ?? product.purchasePrice ?? 0
      );

      if (!Number.isFinite(costPrice) || costPrice < 0) {
        return res.status(400).json({
          success: false,
          message: `Invalid cost price for ${product.name || productId}.`,
        });
      }

      const lineSubtotal = Number(
        (unitPrice * quantity).toFixed(2)
      );

      const lineProfit = Number(
        ((unitPrice - costPrice) * quantity).toFixed(2)
      );

      if (
        !Number.isFinite(lineSubtotal) ||
        !Number.isFinite(lineProfit)
      ) {
        return res.status(400).json({
          success: false,
          message: "Sale amounts are invalid or too large.",
        });
      }

      items.push({
        productId,
        productName: product.name || "",
        sku: product.sku || "",
        quantity,
        unitPrice: Number(unitPrice.toFixed(2)),
        costPrice: Number(costPrice.toFixed(2)),
        subtotal: lineSubtotal,
        discountAmount: 0,
        estimatedProfit: lineProfit,
      });

      subtotal += lineSubtotal;
      profitBeforeDiscount += lineProfit;
    }

    subtotal = Number(subtotal.toFixed(2));

    // Discount is a monetary amount. Default: zero.
    const discountAmount = Number(
      body.discountAmount ?? body.discount ?? 0
    );

    if (
      !Number.isFinite(discountAmount) ||
      discountAmount < 0 ||
      discountAmount > subtotal
    ) {
      return res.status(400).json({
        success: false,
        message: `Discount must be between 0 and ${subtotal.toFixed(2)}.`,
      });
    }

    // Either provide a tax rate (%) or a tax amount, never both.
    let taxAmount = 0;
    let taxRate = null;

    if (
      body.taxRate !== undefined &&
      body.taxRate !== null &&
      body.taxRate !== ""
    ) {
      taxRate = Number(body.taxRate);

      if (
        !Number.isFinite(taxRate) ||
        taxRate < 0 ||
        taxRate > 100
      ) {
        return res.status(400).json({
          success: false,
          message: "Tax rate must be between 0 and 100.",
        });
      }

      if (
        body.taxAmount !== undefined &&
        body.taxAmount !== null &&
        body.taxAmount !== ""
      ) {
        return res.status(400).json({
          success: false,
          message: "Provide either taxRate or taxAmount, not both.",
        });
      }

      taxAmount = Number(
        (
          ((subtotal - discountAmount) * taxRate) /
          100
        ).toFixed(2)
      );
    } else {
      taxAmount = Number(body.taxAmount ?? body.tax ?? 0);

      if (!Number.isFinite(taxAmount) || taxAmount < 0) {
        return res.status(400).json({
          success: false,
          message: "Tax amount must be a valid non-negative number.",
        });
      }
    }

    const grandTotal = Number(
      (subtotal - discountAmount + taxAmount).toFixed(2)
    );

    // Allocate the discount across invoice lines for reporting.
    let allocatedDiscount = 0;

    items.forEach((item, index) => {
      const lineDiscount =
        index === items.length - 1
          ? Number(
              (discountAmount - allocatedDiscount).toFixed(2)
            )
          : subtotal > 0
            ? Number(
                (
                  (discountAmount * item.subtotal) /
                  subtotal
                ).toFixed(2)
              )
            : 0;

      allocatedDiscount = Number(
        (allocatedDiscount + lineDiscount).toFixed(2)
      );

      item.discountAmount = lineDiscount;
      item.estimatedProfit = Number(
        (item.estimatedProfit - lineDiscount).toFixed(2)
      );
    });

    const timestamp = now();

    const customerName =
      typeof body.customerName === "string" &&
      body.customerName.trim()
        ? body.customerName.trim()
        : "Walk-in Customer";

    const allowedPaymentMethods = [
      "Cash",
      "Card",
      "UPI",
      "Bank Transfer",
      "Other",
    ];

    if (
      body.paymentMethod !== undefined &&
      !allowedPaymentMethods.includes(body.paymentMethod)
    ) {
      return res.status(400).json({
        success: false,
        message: "Choose a valid payment method.",
      });
    }

    const paymentMethod = body.paymentMethod || "Cash";

    const invoiceNumber =
      `INV-${Date.now()}-${randomUUID()
        .slice(0, 8)
        .toUpperCase()}`;

    const sale = {
      _id: randomUUID(),
      invoiceNumber,
      customerName,
      paymentMethod,
      items,
      subtotal,
      discountAmount: Number(discountAmount.toFixed(2)),
      taxAmount: Number(taxAmount.toFixed(2)),
      taxRate,
      totalAmount: grandTotal,
      grandTotal,
      estimatedProfit: Number(
        (profitBeforeDiscount - discountAmount).toFixed(2)
      ),
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    // Deduct stock only after all validations pass.
    for (const entry of requestedItems.values()) {
      entry.product.quantity =
        Number(entry.product.quantity) - entry.quantity;

      entry.product.updatedAt = timestamp;
    }

    // JSON files are not a true multi-file transaction.
    // Attempt to restore stock if saving the sale fails.
    await writeCollection("products", products);
    productsWereSaved = true;

    await writeCollection("sales", [sale, ...sales]);

    return res.status(201).json({
      success: true,
      message: "Sale created successfully.",
      data: sale,
      sale, // Compatibility with existing frontend callers.
    });
  } catch (error) {
    console.error("Create sale error:", error);

    if (productsWereSaved && originalProducts) {
      try {
        await writeCollection("products", originalProducts);
      } catch (rollbackError) {
        console.error(
          "CRITICAL: Stock rollback failed:",
          rollbackError
        );
      }
    }

    return res.status(500).json({
      success: false,
      message: "Unable to create sale. Please check the server logs.",
    });
  }
};

// PURCHASES
exports.getPurchases = async (req, res) => {
  try {
    const purchases = (await readCollection("purchases"))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    res.json({ success: true, data: purchases });
  } catch (e) { errorResponse(res, e, "Load purchases"); }
};

exports.getPurchaseById = async (req, res) => {
  try {
    const purchase = (await readCollection("purchases")).find((item) => item._id === req.params.id);
    if (!purchase) return res.status(404).json({ success: false, message: "Purchase not found." });
    res.json({ success: true, data: purchase });
  } catch (e) { errorResponse(res, e, "Load purchase"); }
};

exports.createPurchase = async (req, res) => {
  try {
    const body = req.body || {};
    if (!Array.isArray(body.items) || body.items.length === 0) {
      return res.status(400).json({ success: false, message: "Add at least one item to the purchase." });
    }

    const [purchases, products, suppliers] = await Promise.all([
      readCollection("purchases"),
      readCollection("products"),
      readCollection("suppliers"),
    ]);

    const supplierId = idOf(body.supplierId || body.supplier);
    const supplier = supplierId ? suppliers.find((s) => s._id === supplierId && s.isActive !== false) : null;
    if (supplierId && !supplier) {
      return res.status(400).json({ success: false, message: "Selected supplier was not found." });
    }

    const requested = body.items.map((item) => {
      const productId = idOf(item.productId || item.product || item._id);
      const product = products.find((p) => p._id === productId && p.isActive !== false);
      if (!product) throw new Error("A selected product was not found.");
      const quantity = number(item.quantity, "Quantity", true);
      if (quantity < 1) throw new Error("Quantity must be at least 1.");
      const price = number(item.unitPrice ?? item.costPrice ?? item.price ?? product.costPrice, "Unit price");
      return { product, quantity, price };
    });

    const items = requested.map(({ product, quantity, price }) => ({
      productId: product._id,
      productName: product.name,
      sku: product.sku,
      quantity,
      unitPrice: price,
      subtotal: price * quantity,
    }));

    for (const line of requested) {
      line.product.quantity = Number(line.product.quantity || 0) + line.quantity;
      line.product.updatedAt = now();
    }

    const timestamp = now();
    const purchase = {
      _id: randomUUID(),
      purchaseNumber: `PUR-${Date.now()}`,
      supplierId: supplier?._id || null,
      supplierName: supplier?.name || body.supplierName || "Unspecified supplier",
      items,
      totalAmount: items.reduce((sum, item) => sum + item.subtotal, 0),
      status: "Received",
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await writeCollection("products", products);
    purchases.push(purchase);
    await writeCollection("purchases", purchases);
    res.status(201).json({ success: true, message: "Purchase recorded and stock updated.", data: purchase });
  } catch (e) {
    const clientError = /not found|Quantity|Unit price|must be a valid non-negative/i.test(e.message);
    if (clientError) return res.status(400).json({ success: false, message: e.message });
    errorResponse(res, e, "Record purchase");
  }
};

// DASHBOARD / ANALYTICS
exports.getDashboard = async (req, res) => {
  try {
    const [products, sales] = await Promise.all([
      readCollection("products"),
      readCollection("sales"),
    ]);
    const active = products.filter((p) => p.isActive !== false);
    const month = new Date();
    month.setDate(1);
    month.setHours(0, 0, 0, 0);

    const monthlySales = sales
      .filter((s) => new Date(s.createdAt) >= month)
      .reduce((sum, s) => sum + Number(s.totalAmount || 0), 0);

    const weeklySales = [];
    for (let offset = 6; offset >= 0; offset--) {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - offset);
      const next = new Date(date);
      next.setDate(next.getDate() + 1);
      const salesForDay = sales
        .filter((s) => new Date(s.createdAt) >= date && new Date(s.createdAt) < next)
        .reduce((sum, s) => sum + Number(s.totalAmount || 0), 0);
      weeklySales.push({
        name: date.toLocaleDateString("en-IN", { weekday: "short" }),
        sales: salesForDay,
      });
    }

    const lowStockProducts = active.filter((p) =>
      Number(p.quantity || 0) <= Number(p.reorderLevel ?? p.minStockLevel ?? 5)
    );

    res.json({
      success: true,
      data: {
        totalProducts: active.length,
        inventoryValue: active.reduce((sum, p) => sum + Number(p.costPrice || 0) * Number(p.quantity || 0), 0),
        monthlySales,
        lowStockCount: lowStockProducts.length,
        weeklySales,
        lowStockProducts: lowStockProducts.map((p) => ({
          _id: p._id, name: p.name, sku: p.sku, quantity: p.quantity,
        })),
      },
    });
  } catch (e) { errorResponse(res, e, "Load dashboard"); }
};

exports.getSalesAnalytics = async (req, res) => {
  try {
    const sales = await readCollection("sales");
    res.json({ success: true, data: sales });
  } catch (e) { errorResponse(res, e, "Load sales analytics"); }
};

exports.getInventoryAnalytics = async (req, res) => {
  try {
    const products = (await readCollection("products")).filter((p) => p.isActive !== false);
    const lowStock = products.filter((p) => Number(p.quantity || 0) <= Number(p.reorderLevel ?? p.minStockLevel ?? 5));
    res.json({
      success: true,
      data: {
        totalProducts: products.length,
        inventoryValue: products.reduce((sum, p) => sum + Number(p.costPrice || 0) * Number(p.quantity || 0), 0),
        lowStockCount: lowStock.length,
        products,
        lowStockProducts: lowStock,
      },
    });
  } catch (e) { errorResponse(res, e, "Load inventory analytics"); }
};

// PREDICTIONS: no fabricated forecasts when sales history is missing.
exports.getPredictions = async (req, res) => {
  try {
    const [products, sales] = await Promise.all([
      readCollection("products"),
      readCollection("sales"),
    ]);
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recentSales = sales.filter((s) => new Date(s.createdAt).getTime() >= cutoff);
    const hasHistory = recentSales.length > 0;

    const sold = new Map();
    for (const sale of recentSales) {
      for (const item of sale.items || []) {
        const key = idOf(item.productId || item.product);
        sold.set(key, (sold.get(key) || 0) + Number(item.quantity || 0));
      }
    }

    const predictions = products
      .filter((p) => p.isActive !== false)
      .map((p) => {
        const demand = sold.get(p._id) || 0;
        const reorder = Number(p.reorderLevel ?? p.minStockLevel ?? 5);
        return {
          productId: p._id,
          productName: p.name,
          predictedDemand: hasHistory ? Math.ceil(demand / 30 * 7) : null,
          recommendedQuantity: hasHistory
            ? Math.max(0, Math.ceil(demand / 30 * 7) + reorder - Number(p.quantity || 0))
            : null,
          message: hasHistory
            ? "Estimate based on recorded sales from the last 30 days; it may be unreliable with limited history."
            : "Insufficient sales history for a reliable forecast. Record sales to build prediction data.",
        };
      });

    res.json({ success: true, data: predictions });
  } catch (e) { errorResponse(res, e, "Load predictions"); }
};

exports.getPredictionByProduct = async (req, res) => {
  try {
    const result = await exports.getPredictionsData();
    const prediction = result.find((item) => item.productId === req.params.productId);
    if (!prediction) return res.status(404).json({ success: false, message: "Prediction not found for this product." });
    res.json({ success: true, data: prediction });
  } catch (e) { errorResponse(res, e, "Load product prediction"); }
};

exports.getPredictionsData = async () => {
  const [products, sales] = await Promise.all([
    readCollection("products"),
    readCollection("sales"),
  ]);
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recent = sales.filter((s) => new Date(s.createdAt).getTime() >= cutoff);
  const totals = new Map();

  for (const sale of recent) {
    for (const item of sale.items || []) {
      const key = idOf(item.productId || item.product);
      totals.set(key, (totals.get(key) || 0) + Number(item.quantity || 0));
    }
  }

  return products.filter((p) => p.isActive !== false).map((p) => {
    const history = recent.length > 0;
    const demand = totals.get(p._id) || 0;
    const reorder = Number(p.reorderLevel ?? p.minStockLevel ?? 5);
    return {
      productId: p._id,
      productName: p.name,
      predictedDemand: history ? Math.ceil(demand / 30 * 7) : null,
      recommendedQuantity: history ? Math.max(0, Math.ceil(demand / 30 * 7) + reorder - Number(p.quantity || 0)) : null,
      message: history
        ? "Estimate based on recorded sales from the last 30 days; it may be unreliable with limited history."
        : "Insufficient sales history for a reliable forecast. Record sales to build prediction data.",
    };
  });
};

/* =========================================================
   SIMULATED STOCK MARKET / PAPER TRADING
   All quotes are fictional demo prices, not live market data.
   ========================================================= */

const DEMO_MARKET = [
  { symbol: "RELIANCE.NS", name: "Reliance Industries", exchange: "NSE", currency: "INR", price: 1450 },
  { symbol: "TCS.NS", name: "Tata Consultancy Services", exchange: "NSE", currency: "INR", price: 3200 },
  { symbol: "INFY.NS", name: "Infosys", exchange: "NSE", currency: "INR", price: 1550 },
  { symbol: "HDFCBANK.NS", name: "HDFC Bank", exchange: "NSE", currency: "INR", price: 1750 },
  { symbol: "ICICIBANK.NS", name: "ICICI Bank", exchange: "NSE", currency: "INR", price: 1250 },
  { symbol: "AAPL", name: "Apple", exchange: "NASDAQ", currency: "USD", price: 220 },
  { symbol: "MSFT", name: "Microsoft", exchange: "NASDAQ", currency: "USD", price: 480 },
  { symbol: "NVDA", name: "NVIDIA", exchange: "NASDAQ", currency: "USD", price: 180 },
  { symbol: "GOOGL", name: "Alphabet", exchange: "NASDAQ", currency: "USD", price: 190 },
  { symbol: "AMZN", name: "Amazon", exchange: "NASDAQ", currency: "USD", price: 225 },
];

const DEMO_ACCOUNT_ID = "local-paper-trading-account";

async function ensureDemoMarket() {
  let market = await readCollection("market");

  if (market.length === 0) {
    const timestamp = now();
    market = DEMO_MARKET.map((stock) => ({
      ...stock,
      isSimulated: true,
      updatedAt: timestamp,
    }));
    await writeCollection("market", market);
  }

  return market;
}

async function ensureTradingAccount() {
  const accounts = await readCollection("tradingAccounts");
  let account = accounts.find((item) => item._id === DEMO_ACCOUNT_ID);

  if (!account) {
    account = {
      _id: DEMO_ACCOUNT_ID,
      accountType: "PAPER_TRADING",
      cashBalances: { INR: 100000, USD: 10000 },
      createdAt: now(),
      updatedAt: now(),
    };
    await writeCollection("tradingAccounts", [...accounts, account]);
  }

  return account;
}

exports.getMarket = async (req, res) => {
  try {
    const market = await ensureDemoMarket();
    res.json({
      success: true,
      simulated: true,
      message: "Demo prices only. These are not live exchange quotes.",
      data: market,
    });
  } catch (e) {
    errorResponse(res, e, "Load simulated market");
  }
};

exports.getTradingPortfolio = async (req, res) => {
  try {
    const [account, holdings, market] = await Promise.all([
      ensureTradingAccount(),
      readCollection("holdings"),
      ensureDemoMarket(),
    ]);

    const accountHoldings = holdings.filter(
      (item) => item.accountId === DEMO_ACCOUNT_ID && item.quantity > 0
    );

    const data = accountHoldings.map((holding) => {
      const stock = market.find((item) => item.symbol === holding.symbol);
      const currentPrice = stock?.price ?? holding.averagePrice;
      const marketValue = Number((currentPrice * holding.quantity).toFixed(2));
      const costValue = Number((holding.averagePrice * holding.quantity).toFixed(2));

      return {
        ...holding,
        stockName: stock?.name || holding.symbol,
        currency: stock?.currency || holding.currency,
        currentPrice,
        marketValue,
        costValue,
        unrealizedProfitLoss: Number((marketValue - costValue).toFixed(2)),
      };
    });

    const totals = {};
    for (const currency of ["INR", "USD"]) {
      const currencyHoldings = data.filter((item) => item.currency === currency);
      totals[currency] = {
        cash: Number(account.cashBalances[currency] || 0),
        holdingsValue: Number(
          currencyHoldings.reduce((sum, item) => sum + item.marketValue, 0).toFixed(2)
        ),
        totalValue: Number(
          (
            Number(account.cashBalances[currency] || 0) +
            currencyHoldings.reduce((sum, item) => sum + item.marketValue, 0)
          ).toFixed(2)
        ),
        unrealizedProfitLoss: Number(
          currencyHoldings.reduce((sum, item) => sum + item.unrealizedProfitLoss, 0).toFixed(2)
        ),
      };
    }

    res.json({
      success: true,
      simulated: true,
      data: {
        accountId: account._id,
        cashBalances: account.cashBalances,
        totals,
        holdings: data,
      },
    });
  } catch (e) {
    errorResponse(res, e, "Load trading portfolio");
  }
};

exports.getTradingOrders = async (req, res) => {
  try {
    const orders = (await readCollection("tradingOrders"))
      .filter((item) => item.accountId === DEMO_ACCOUNT_ID)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

    res.json({ success: true, simulated: true, data: orders });
  } catch (e) {
    errorResponse(res, e, "Load trading orders");
  }
};

async function executePaperTrade(req, res, side) {
  let oldAccounts;
  let oldHoldings;
  let oldOrders;

  try {
    const body = req.body || {};
    const symbol = typeof body.symbol === "string" ? body.symbol.trim().toUpperCase() : "";
    const quantity = Number(body.quantity);

    if (!symbol) {
      return res.status(400).json({ success: false, message: "A stock symbol is required." });
    }

    if (!Number.isSafeInteger(quantity) || quantity <= 0) {
      return res.status(400).json({ success: false, message: "Quantity must be a positive whole number." });
    }

    
const [market, , holdings, orders] = await Promise.all([
  ensureDemoMarket(),
  ensureTradingAccount(),
  readCollection("holdings"),
  readCollection("tradingOrders"),
]);

const accounts = await readCollection("tradingAccounts");


    const stock = market.find((item) => item.symbol === symbol);
    if (!stock) {
      return res.status(404).json({ success: false, message: "Stock not found in the demo market." });
    }

    const account = accounts.find((item) => item._id === DEMO_ACCOUNT_ID);
    if (!account) {
      return res.status(500).json({ success: false, message: "Trading account could not be initialized." });
    }

    const accountHoldings = holdings.find(
      (item) => item.accountId === DEMO_ACCOUNT_ID && item.symbol === symbol
    );

    const price = Number(stock.price);
    const total = Number((price * quantity).toFixed(2));
    const currency = stock.currency;

    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(total)) {
      return res.status(400).json({ success: false, message: "Invalid demo market price." });
    }

    if (side === "BUY" && Number(account.cashBalances[currency] || 0) < total) {
      return res.status(400).json({
        success: false,
        message: `Insufficient ${currency} virtual cash. Required: ${total}; available: ${Number(account.cashBalances[currency] || 0)}.`,
      });
    }

    if (side === "SELL" && (!accountHoldings || accountHoldings.quantity < quantity)) {
      return res.status(400).json({
        success: false,
        message: `You do not own enough shares to sell. Available: ${accountHoldings?.quantity || 0}.`,
      });
    }

    oldAccounts = accounts.map((item) => ({ ...item, cashBalances: { ...item.cashBalances } }));
    oldHoldings = holdings.map((item) => ({ ...item }));
    oldOrders = orders.map((item) => ({ ...item }));

    const timestamp = now();
    const order = {
      _id: randomUUID(),
      orderNumber: `PAPER-${Date.now()}-${randomUUID().slice(0, 6).toUpperCase()}`,
      accountId: DEMO_ACCOUNT_ID,
      symbol,
      stockName: stock.name,
      side,
      orderType: "MARKET",
      quantity,
      executedPrice: price,
      currency,
      totalAmount: total,
      status: "COMPLETED",
      simulated: true,
      createdAt: timestamp,
      executedAt: timestamp,
    };

    if (side === "BUY") {
      account.cashBalances[currency] = Number(
        (Number(account.cashBalances[currency] || 0) - total).toFixed(2)
      );

      if (accountHoldings) {
        const oldQuantity = accountHoldings.quantity;
        accountHoldings.averagePrice = Number(
          (
            (accountHoldings.averagePrice * oldQuantity + price * quantity) /
            (oldQuantity + quantity)
          ).toFixed(4)
        );
        accountHoldings.quantity += quantity;
        accountHoldings.updatedAt = timestamp;
      } else {
        holdings.push({
          _id: randomUUID(),
          accountId: DEMO_ACCOUNT_ID,
          symbol,
          stockName: stock.name,
          currency,
          quantity,
          averagePrice: price,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      }
    } else {
      account.cashBalances[currency] = Number(
        (Number(account.cashBalances[currency] || 0) + total).toFixed(2)
      );
      accountHoldings.quantity -= quantity;
      accountHoldings.updatedAt = timestamp;

      if (accountHoldings.quantity === 0) {
        const index = holdings.findIndex((item) => item._id === accountHoldings._id);
        if (index >= 0) holdings.splice(index, 1);
      }
    }

    account.updatedAt = timestamp;
    orders.unshift(order);

    try {
      await writeCollection("tradingAccounts", accounts);
      await writeCollection("holdings", holdings);
      await writeCollection("tradingOrders", orders);
    } catch (saveError) {
      await Promise.all([
        writeCollection("tradingAccounts", oldAccounts),
        writeCollection("holdings", oldHoldings),
        writeCollection("tradingOrders", oldOrders),
      ]);
      throw saveError;
    }

    res.status(201).json({
      success: true,
      message: `${side === "BUY" ? "Buy" : "Sell"} order completed in paper trading.`,
      simulated: true,
      data: order,
    });
  } catch (e) {
    console.error("Paper trade error:", e);
    res.status(500).json({
      success: false,
      message: "Unable to complete the simulated trade. Check the backend logs.",
    });
  }
}

exports.buyShares = (req, res) => executePaperTrade(req, res, "BUY");
exports.sellShares = (req, res) => executePaperTrade(req, res, "SELL");

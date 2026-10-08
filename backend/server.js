const express = require("express");
const cors = require("cors");
const Database = require("better-sqlite3");
const XLSX = require("xlsx");
const multer = require("multer");

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

const upload = multer({
  storage: multer.memoryStorage(),
});

const db = new Database("pharmacy.db");

// =========================
// DATABASE
// =========================

db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS medicines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    company TEXT DEFAULT '',
    batch TEXT DEFAULT '',
    quantity INTEGER DEFAULT 0,
    price REAL DEFAULT 0,
    expiry TEXT DEFAULT '',
    low_stock_limit INTEGER DEFAULT 10,
    reorder_quantity INTEGER DEFAULT 20,
    supplier TEXT DEFAULT '',
    supplier_phone TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Safely add columns to older databases
const medicineColumns = db
  .prepare(`PRAGMA table_info(medicines)`)
  .all()
  .map((column) => column.name);

if (!medicineColumns.includes("reorder_quantity")) {
  db.exec(`
    ALTER TABLE medicines
    ADD COLUMN reorder_quantity INTEGER DEFAULT 20
  `);
}

if (!medicineColumns.includes("supplier")) {
  db.exec(`
    ALTER TABLE medicines
    ADD COLUMN supplier TEXT DEFAULT ''
  `);
}

if (!medicineColumns.includes("supplier_phone")) {
  db.exec(`
    ALTER TABLE medicines
    ADD COLUMN supplier_phone TEXT DEFAULT ''
  `);
}

// =========================
// PURCHASES TABLE
// =========================

db.exec(`
  CREATE TABLE IF NOT EXISTS purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    medicine_id INTEGER NOT NULL,
    medicine_name TEXT DEFAULT '',
    supplier TEXT DEFAULT '',
    supplier_phone TEXT DEFAULT '',
    quantity INTEGER NOT NULL,
    purchase_price REAL DEFAULT 0,
    purchase_date TEXT NOT NULL,
    invoice_number TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (medicine_id) REFERENCES medicines(id)
      ON DELETE RESTRICT
  )
`);

// =========================
// SALES TABLE
// =========================

db.exec(`
  CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    medicine_id INTEGER NOT NULL,
    medicine_name TEXT DEFAULT '',
    batch TEXT DEFAULT '',
    quantity INTEGER NOT NULL,
    selling_price REAL DEFAULT 0,
    total_amount REAL DEFAULT 0,
    customer_name TEXT DEFAULT '',
    customer_phone TEXT DEFAULT '',
    sale_date TEXT NOT NULL,
    notes TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (medicine_id) REFERENCES medicines(id)
      ON DELETE RESTRICT
  )
`);

// =========================
// DATE HELPERS
// =========================

function parseDateOnly(value) {
  if (!value) {
    return null;
  }

  const text = String(value).slice(0, 10);

  const match = text.match(
    /^(\d{4})-(\d{2})-(\d{2})$/
  );

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);

  const date = new Date(year, month, day);

  date.setHours(0, 0, 0, 0);

  return date;
}

function getExpiryStatus(expiry) {
  const expiryDate = parseDateOnly(expiry);

  if (!expiryDate) {
    return "none";
  }

  const today = new Date();

  today.setHours(0, 0, 0, 0);

  const difference = Math.ceil(
    (expiryDate - today) /
      (1000 * 60 * 60 * 24)
  );

  if (difference < 0) {
    return "expired";
  }

  if (difference <= 30) {
    return "expiring";
  }

  return "safe";
}

function getDaysUntilExpiry(expiry) {
  const expiryDate = parseDateOnly(expiry);

  if (!expiryDate) {
    return null;
  }

  const today = new Date();

  today.setHours(0, 0, 0, 0);

  return Math.ceil(
    (expiryDate - today) /
      (1000 * 60 * 60 * 24)
  );
}

// =========================
// HOME
// =========================

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "PharmaStock Backend is running",
  });
});

// =========================
// MEDICINES
// =========================

app.get("/api/medicines", (req, res) => {
  try {
    const medicines = db
      .prepare(`
        SELECT *
        FROM medicines
        ORDER BY name ASC
      `)
      .all();

    const result = medicines.map((medicine) => ({
      ...medicine,
      expiryStatus: getExpiryStatus(
        medicine.expiry
      ),
      daysUntilExpiry:
        getDaysUntilExpiry(
          medicine.expiry
        ),
    }));

    res.json(result);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch medicines",
      error: error.message,
    });
  }
});

app.post("/api/medicines", (req, res) => {
  try {
    const {
      name,
      company,
      batch,
      quantity,
      price,
      expiry,
      low_stock_limit,
      reorder_quantity,
      supplier,
      supplier_phone,
    } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({
        success: false,
        message: "Medicine name is required",
      });
    }

    const result = db
      .prepare(`
        INSERT INTO medicines
        (
          name,
          company,
          batch,
          quantity,
          price,
          expiry,
          low_stock_limit,
          reorder_quantity,
          supplier,
          supplier_phone
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        String(name).trim(),
        String(company || "").trim(),
        String(batch || "").trim(),
        Math.max(0, Number(quantity) || 0),
        Math.max(0, Number(price) || 0),
        String(expiry || ""),
        Math.max(
          0,
          Number(low_stock_limit) || 10
        ),
        Math.max(
          0,
          Number(reorder_quantity) || 20
        ),
        String(supplier || "").trim(),
        String(supplier_phone || "").trim()
      );

    res.json({
      success: true,
      message: "Medicine added successfully",
      id: result.lastInsertRowid,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Failed to add medicine",
      error: error.message,
    });
  }
});

app.put("/api/medicines/:id", (req, res) => {
  try {
    const { id } = req.params;

    const {
      name,
      company,
      batch,
      quantity,
      price,
      expiry,
      low_stock_limit,
      reorder_quantity,
      supplier,
      supplier_phone,
    } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({
        success: false,
        message: "Medicine name is required",
      });
    }

    const result = db
      .prepare(`
        UPDATE medicines
        SET
          name = ?,
          company = ?,
          batch = ?,
          quantity = ?,
          price = ?,
          expiry = ?,
          low_stock_limit = ?,
          reorder_quantity = ?,
          supplier = ?,
          supplier_phone = ?
        WHERE id = ?
      `)
      .run(
        String(name).trim(),
        String(company || "").trim(),
        String(batch || "").trim(),
        Math.max(0, Number(quantity) || 0),
        Math.max(0, Number(price) || 0),
        String(expiry || ""),
        Math.max(
          0,
          Number(low_stock_limit) || 10
        ),
        Math.max(
          0,
          Number(reorder_quantity) || 20
        ),
        String(supplier || "").trim(),
        String(supplier_phone || "").trim(),
        id
      );

    if (result.changes === 0) {
      return res.status(404).json({
        success: false,
        message: "Medicine not found",
      });
    }

    res.json({
      success: true,
      message: "Medicine updated successfully",
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Failed to update medicine",
      error: error.message,
    });
  }
});

app.delete("/api/medicines/:id", (req, res) => {
  try {
    const { id } = req.params;

    const result = db
      .prepare(`
        DELETE FROM medicines
        WHERE id = ?
      `)
      .run(id);

    if (result.changes === 0) {
      return res.status(404).json({
        success: false,
        message: "Medicine not found",
      });
    }

    res.json({
      success: true,
      message: "Medicine deleted successfully",
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message:
        "Cannot delete this medicine because it has purchase or sales history.",
      error: error.message,
    });
  }
});

// =========================
// STOCK CHANGES
// =========================

app.patch(
  "/api/medicines/:id/increase-stock",
  (req, res) => {
    try {
      const { id } = req.params;
      const amount = Number(req.body.amount);

      if (
        !Number.isInteger(amount) ||
        amount <= 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Amount must be a whole number greater than 0",
        });
      }

      const result = db
        .prepare(`
          UPDATE medicines
          SET quantity = quantity + ?
          WHERE id = ?
        `)
        .run(amount, id);

      if (result.changes === 0) {
        return res.status(404).json({
          success: false,
          message: "Medicine not found",
        });
      }

      const medicine = db
        .prepare(`
          SELECT quantity
          FROM medicines
          WHERE id = ?
        `)
        .get(id);

      res.json({
        success: true,
        quantity: medicine.quantity,
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        success: false,
        message:
          "Failed to increase stock",
      });
    }
  }
);

app.patch(
  "/api/medicines/:id/decrease-stock",
  (req, res) => {
    try {
      const { id } = req.params;
      const amount = Number(req.body.amount);

      if (
        !Number.isInteger(amount) ||
        amount <= 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Amount must be a whole number greater than 0",
        });
      }

      const medicine = db
        .prepare(`
          SELECT quantity
          FROM medicines
          WHERE id = ?
        `)
        .get(id);

      if (!medicine) {
        return res.status(404).json({
          success: false,
          message: "Medicine not found",
        });
      }

      if (medicine.quantity < amount) {
        return res.status(400).json({
          success: false,
          message:
            "Not enough stock available",
        });
      }

      const newQuantity =
        medicine.quantity - amount;

      db.prepare(`
        UPDATE medicines
        SET quantity = ?
        WHERE id = ?
      `).run(newQuantity, id);

      res.json({
        success: true,
        quantity: newQuantity,
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        success: false,
        message:
          "Failed to decrease stock",
      });
    }
  }
);

// =========================
// PURCHASES
// =========================

app.get("/api/purchases", (req, res) => {
  try {
    const purchases = db
      .prepare(`
        SELECT *
        FROM purchases
        ORDER BY id DESC
      `)
      .all();

    res.json(purchases);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch purchases",
    });
  }
});

app.post("/api/purchases", (req, res) => {
  try {
    const {
      medicine_id,
      supplier,
      supplier_phone,
      quantity,
      purchase_price,
      purchase_date,
      invoice_number,
      notes,
    } = req.body;

    const medicineId = Number(medicine_id);
    const purchaseQuantity = Number(quantity);
    const purchasePrice =
      Math.max(
        0,
        Number(purchase_price) || 0
      );

    if (!Number.isInteger(medicineId)) {
      return res.status(400).json({
        success: false,
        message: "Valid medicine is required",
      });
    }

    if (
      !Number.isInteger(purchaseQuantity) ||
      purchaseQuantity <= 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Purchase quantity must be greater than 0",
      });
    }

    const medicine = db
      .prepare(`
        SELECT *
        FROM medicines
        WHERE id = ?
      `)
      .get(medicineId);

    if (!medicine) {
      return res.status(404).json({
        success: false,
        message: "Medicine not found",
      });
    }

    const date =
      purchase_date ||
      new Date().toISOString().split("T")[0];

    const transaction =
      db.transaction(() => {
        const result = db
          .prepare(`
            INSERT INTO purchases
            (
              medicine_id,
              medicine_name,
              supplier,
              supplier_phone,
              quantity,
              purchase_price,
              purchase_date,
              invoice_number,
              notes
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `)
          .run(
            medicineId,
            medicine.name,
            String(
              supplier || medicine.supplier || ""
            ).trim(),
            String(
              supplier_phone ||
                medicine.supplier_phone ||
                ""
            ).trim(),
            purchaseQuantity,
            purchasePrice,
            date,
            String(
              invoice_number || ""
            ).trim(),
            String(notes || "").trim()
          );

        db.prepare(`
          UPDATE medicines
          SET
            quantity = quantity + ?,
            supplier = ?,
            supplier_phone = ?
          WHERE id = ?
        `).run(
          purchaseQuantity,
          String(
            supplier || medicine.supplier || ""
          ).trim(),
          String(
            supplier_phone ||
              medicine.supplier_phone ||
              ""
          ).trim(),
          medicineId
        );

        return result.lastInsertRowid;
      });

    const updatedMedicine = db
      .prepare(`
        SELECT quantity
        FROM medicines
        WHERE id = ?
      `)
      .get(medicineId);

    res.json({
      success: true,
      message:
        "Purchase saved and stock increased",
      purchaseId: transaction,
      newQuantity:
        updatedMedicine.quantity,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Failed to create purchase",
      error: error.message,
    });
  }
});

// =========================
// SALES
// =========================

app.get("/api/sales", (req, res) => {
  try {
    const sales = db
      .prepare(`
        SELECT *
        FROM sales
        ORDER BY id DESC
      `)
      .all();

    res.json(sales);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch sales",
    });
  }
});

app.post("/api/sales", (req, res) => {
  try {
    const {
      medicine_id,
      quantity,
      selling_price,
      customer_name,
      customer_phone,
      sale_date,
      notes,
    } = req.body;

    const medicineId = Number(medicine_id);
    const saleQuantity = Number(quantity);
    const sellingPrice =
      Math.max(
        0,
        Number(selling_price) || 0
      );

    if (!Number.isInteger(medicineId)) {
      return res.status(400).json({
        success: false,
        message: "Valid medicine is required",
      });
    }

    if (
      !Number.isInteger(saleQuantity) ||
      saleQuantity <= 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Sale quantity must be greater than 0",
      });
    }

    const medicine = db
      .prepare(`
        SELECT *
        FROM medicines
        WHERE id = ?
      `)
      .get(medicineId);

    if (!medicine) {
      return res.status(404).json({
        success: false,
        message: "Medicine not found",
      });
    }

    if (medicine.quantity < saleQuantity) {
      return res.status(400).json({
        success: false,
        message:
          `Not enough stock. Available stock: ${medicine.quantity}`,
      });
    }

    const date =
      sale_date ||
      new Date().toISOString().split("T")[0];

    const totalAmount =
      saleQuantity * sellingPrice;

    const transaction =
      db.transaction(() => {
        const result = db
          .prepare(`
            INSERT INTO sales
            (
              medicine_id,
              medicine_name,
              batch,
              quantity,
              selling_price,
              total_amount,
              customer_name,
              customer_phone,
              sale_date,
              notes
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `)
          .run(
            medicineId,
            medicine.name,
            medicine.batch || "",
            saleQuantity,
            sellingPrice,
            totalAmount,
            String(
              customer_name || ""
            ).trim(),
            String(
              customer_phone || ""
            ).trim(),
            date,
            String(notes || "").trim()
          );

        db.prepare(`
          UPDATE medicines
          SET quantity = quantity - ?
          WHERE id = ?
        `).run(
          saleQuantity,
          medicineId
        );

        return result.lastInsertRowid;
      });

    const updatedMedicine = db
      .prepare(`
        SELECT quantity
        FROM medicines
        WHERE id = ?
      `)
      .get(medicineId);

    res.json({
      success: true,
      message:
        "Sale completed and stock updated",
      saleId: transaction,
      totalAmount,
      newQuantity:
        updatedMedicine.quantity,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Failed to create sale",
      error: error.message,
    });
  }
});

// =========================
// SALES SUMMARY
// =========================

app.get("/api/sales/summary", (req, res) => {
  try {
    const result = db
      .prepare(`
        SELECT
          COUNT(*) AS totalTransactions,
          COALESCE(SUM(quantity), 0) AS totalUnitsSold,
          COALESCE(SUM(total_amount), 0) AS totalRevenue
        FROM sales
      `)
      .get();

    res.json(result);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message:
        "Failed to load sales summary",
    });
  }
});

// =========================
// PURCHASE SUMMARY
// =========================

app.get(
  "/api/purchases/summary",
  (req, res) => {
    try {
      const result = db
        .prepare(`
          SELECT
            COUNT(*) AS totalTransactions,
            COALESCE(SUM(quantity), 0) AS totalUnitsPurchased,
            COALESCE(
              SUM(quantity * purchase_price),
              0
            ) AS totalPurchaseAmount
          FROM purchases
        `)
        .get();

      res.json(result);
    } catch (error) {
      console.error(error);

      res.status(500).json({
        success: false,
        message:
          "Failed to load purchase summary",
      });
    }
  }
);

// =========================
// DASHBOARD
// =========================

app.get("/api/dashboard", (req, res) => {
  try {
    const medicines = db
      .prepare(`
        SELECT *
        FROM medicines
      `)
      .all();

    let lowStock = 0;
    let outOfStock = 0;
    let expiringSoon = 0;
    let expired = 0;

    medicines.forEach((medicine) => {
      if (medicine.quantity === 0) {
        outOfStock++;
      } else if (
        medicine.quantity <=
        medicine.low_stock_limit
      ) {
        lowStock++;
      }

      const expiryStatus =
        getExpiryStatus(
          medicine.expiry
        );

      if (
        medicine.quantity > 0 &&
        expiryStatus === "expiring"
      ) {
        expiringSoon++;
      }

      if (
        medicine.quantity > 0 &&
        expiryStatus === "expired"
      ) {
        expired++;
      }
    });

    const sales = db
      .prepare(`
        SELECT
          COUNT(*) AS transactions,
          COALESCE(SUM(quantity), 0) AS units,
          COALESCE(SUM(total_amount), 0) AS revenue
        FROM sales
      `)
      .get();

    const purchases = db
      .prepare(`
        SELECT
          COUNT(*) AS transactions,
          COALESCE(SUM(quantity), 0) AS units,
          COALESCE(
            SUM(quantity * purchase_price),
            0
          ) AS amount
        FROM purchases
      `)
      .get();

    res.json({
      totalMedicines: medicines.length,
      lowStock,
      outOfStock,
      expiringSoon,
      expired,

      totalSales:
        sales.transactions || 0,

      totalUnitsSold:
        sales.units || 0,

      totalRevenue:
        sales.revenue || 0,

      totalPurchases:
        purchases.transactions || 0,

      totalUnitsPurchased:
        purchases.units || 0,

      totalPurchaseAmount:
        purchases.amount || 0,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message:
        "Failed to load dashboard",
    });
  }
});

// =========================
// SUPPLIERS
// =========================

app.get("/api/suppliers", (req, res) => {
  try {
    const suppliers = db
      .prepare(`
        SELECT
          supplier,
          supplier_phone,
          COUNT(*) AS medicine_count
        FROM medicines
        WHERE TRIM(supplier) <> ''
        GROUP BY supplier, supplier_phone
        ORDER BY supplier ASC
      `)
      .all();

    res.json(suppliers);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch suppliers",
    });
  }
});

// =========================
// EXCEL IMPORT
// =========================

app.post(
  "/api/medicines/import",
  upload.single("file"),
  (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message:
            "No Excel file was received",
        });
      }

      const workbook = XLSX.read(
        req.file.buffer,
        {
          type: "buffer",
          cellDates: true,
        }
      );

      if (
        !workbook.SheetNames ||
        workbook.SheetNames.length === 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Excel file contains no sheets",
        });
      }

      const worksheet =
        workbook.Sheets[
          workbook.SheetNames[0]
        ];

      const rows =
        XLSX.utils.sheet_to_json(
          worksheet,
          {
            defval: "",
          }
        );

      if (rows.length === 0) {
        return res.status(400).json({
          success: false,
          message:
            "Excel file is empty",
        });
      }

      let imported = 0;
      let skipped = 0;

      const insertMedicine = db.prepare(`
        INSERT INTO medicines
        (
          name,
          company,
          batch,
          quantity,
          price,
          expiry,
          low_stock_limit,
          reorder_quantity,
          supplier,
          supplier_phone
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const transaction =
        db.transaction(() => {
          for (const row of rows) {
            const name =
              row["Medicine"] ||
              row["medicine"] ||
              row["Medicine Name"] ||
              "";

            if (!String(name).trim()) {
              skipped++;
              continue;
            }

            let expiry =
              row["Expiry"] || "";

            if (expiry instanceof Date) {
              expiry = expiry
                .toISOString()
                .split("T")[0];
            }

            insertMedicine.run(
              String(name).trim(),

              String(
                row["Company"] || ""
              ).trim(),

              String(
                row["Batch"] || ""
              ).trim(),

              Math.max(
                0,
                Number(
                  row["Quantity"]
                ) || 0
              ),

              Math.max(
                0,
                Number(
                  row["Price"]
                ) || 0
              ),

              String(expiry),

              Math.max(
                0,
                Number(
                  row["Low Stock Limit"]
                ) || 10
              ),

              Math.max(
                0,
                Number(
                  row["Reorder Quantity"]
                ) || 20
              ),

              String(
                row["Supplier"] || ""
              ).trim(),

              String(
                row["Supplier Phone"] || ""
              ).trim()
            );

            imported++;
          }
        });

      transaction();

      res.json({
        success: true,
        message:
          "Excel imported successfully",
        imported,
        skipped,
      });
    } catch (error) {
      console.error(
        "IMPORT ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to import Excel file",
        error: error.message,
      });
    }
  }
);

// =========================
// START SERVER
// =========================

app.listen(PORT, () => {
  console.log(
    `PharmaStock Backend running at http://localhost:${PORT}`
  );
});
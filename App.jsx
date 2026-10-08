import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import "./App.css";

const API = "http://localhost:5000";

const today = () => new Date().toISOString().split("T")[0];

const emptyMedicine = {
  name: "",
  company: "",
  batch: "",
  quantity: "",
  price: "",
  expiry: "",
  low_stock_limit: 10,
  reorder_quantity: 20,
  supplier: "",
  supplier_phone: "",
};

const emptyPurchase = {
  medicine_id: "",
  quantity: "",
  purchase_price: "",
  purchase_date: today(),
  supplier: "",
  supplier_phone: "",
  invoice_number: "",
  notes: "",
};

const emptySale = {
  medicine_id: "",
  quantity: "",
  selling_price: "",
  customer_name: "",
  customer_phone: "",
  sale_date: today(),
  notes: "",
};

function App() {
  const [medicines, setMedicines] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [sales, setSales] = useState([]);
  const [history, setHistory] = useState([]);
  const [reorders, setReorders] = useState([]);
  const [stats, setStats] = useState({});
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const [showMedicineForm, setShowMedicineForm] = useState(false);
  const [showPurchaseForm, setShowPurchaseForm] = useState(false);
  const [showSaleForm, setShowSaleForm] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showPurchases, setShowPurchases] = useState(false);
  const [showSales, setShowSales] = useState(false);

  const [editingMedicine, setEditingMedicine] = useState(null);
  const [historyMedicine, setHistoryMedicine] = useState(null);

  const [medicineForm, setMedicineForm] = useState(emptyMedicine);
  const [purchaseForm, setPurchaseForm] = useState(emptyPurchase);
  const [saleForm, setSaleForm] = useState(emptySale);

  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);

  const loadData = async () => {
    try {
      const [
        medicineRes,
        dashboardRes,
        purchaseRes,
        salesRes,
        historyRes,
        reorderRes,
      ] = await Promise.all([
        axios.get(`${API}/api/medicines`),
        axios.get(`${API}/api/dashboard`),
        axios.get(`${API}/api/purchases`),
        axios.get(`${API}/api/sales`),
        axios.get(`${API}/api/inventory-history`),
        axios.get(`${API}/api/reorder-recommendations`),
      ]);

      setMedicines(medicineRes.data);
      setStats(dashboardRes.data);
      setPurchases(purchaseRes.data);
      setSales(salesRes.data);
      setHistory(historyRes.data);
      setReorders(reorderRes.data);
    } catch (error) {
      console.error("Failed to load PharmaStock:", error);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openAddMedicine = () => {
    setEditingMedicine(null);
    setMedicineForm({ ...emptyMedicine });
    setShowMedicineForm(true);
  };

  const openEditMedicine = (medicine) => {
    setEditingMedicine(medicine);
    setMedicineForm({
      name: medicine.name || "",
      company: medicine.company || "",
      batch: medicine.batch || "",
      quantity: medicine.quantity ?? 0,
      price: medicine.price ?? 0,
      expiry: medicine.expiry || "",
      low_stock_limit: medicine.low_stock_limit ?? 10,
      reorder_quantity: medicine.reorder_quantity ?? 20,
      supplier: medicine.supplier || "",
      supplier_phone: medicine.supplier_phone || "",
    });
    setShowMedicineForm(true);
  };

  const closeMedicineForm = () => {
    setShowMedicineForm(false);
    setEditingMedicine(null);
    setMedicineForm({ ...emptyMedicine });
  };

  const saveMedicine = async (event) => {
    event.preventDefault();

    if (!medicineForm.name.trim()) {
      alert("Medicine name is required.");
      return;
    }

    try {
      const payload = {
        ...medicineForm,
        name: medicineForm.name.trim(),
        quantity: Number(medicineForm.quantity) || 0,
        price: Number(medicineForm.price) || 0,
        low_stock_limit: Number(medicineForm.low_stock_limit) || 10,
        reorder_quantity: Number(medicineForm.reorder_quantity) || 20,
      };

      if (editingMedicine) {
        await axios.put(
          `${API}/api/medicines/${editingMedicine.id}`,
          payload
        );
        alert("Medicine updated successfully.");
      } else {
        await axios.post(`${API}/api/medicines`, payload);
        alert("Medicine added successfully.");
      }

      closeMedicineForm();
      await loadData();
    } catch (error) {
      alert(error.response?.data?.message || "Could not save medicine.");
    }
  };

  const deleteMedicine = async (id) => {
    if (!window.confirm("Delete this medicine?")) return;

    try {
      await axios.delete(`${API}/api/medicines/${id}`);
      await loadData();
    } catch (error) {
      alert(error.response?.data?.message || "Could not delete medicine.");
    }
  };

  const changeStock = async (medicine, type) => {
    const amount = window.prompt(
      `${type === "increase" ? "Add" : "Remove"} how many units?\n\n${medicine.name}\nCurrent stock: ${medicine.quantity}`
    );

    if (amount === null) return;

    const number = Number(amount);
    if (!Number.isInteger(number) || number <= 0) {
      alert("Enter a valid whole number.");
      return;
    }

    try {
      await axios.patch(
        `${API}/api/medicines/${medicine.id}/${
          type === "increase" ? "increase-stock" : "decrease-stock"
        }`,
        { amount: number }
      );
      await loadData();
    } catch (error) {
      alert(error.response?.data?.message || "Could not update stock.");
    }
  };

  const openPurchase = (medicine = null, suggestedQuantity = null) => {
    setPurchaseForm({
      ...emptyPurchase,
      medicine_id: medicine?.id || "",
      quantity:
        suggestedQuantity ??
        medicine?.reorder_quantity ??
        "",
      supplier: medicine?.supplier || "",
      supplier_phone: medicine?.supplier_phone || "",
    });
    setShowPurchaseForm(true);
  };

  const handlePurchaseChange = (event) => {
    const { name, value } = event.target;

    if (name === "medicine_id") {
      const medicine = medicines.find(
        (item) => String(item.id) === String(value)
      );

      setPurchaseForm({
        ...purchaseForm,
        medicine_id: value,
        quantity: medicine?.reorder_quantity || "",
        supplier: medicine?.supplier || "",
        supplier_phone: medicine?.supplier_phone || "",
      });
      return;
    }

    setPurchaseForm({ ...purchaseForm, [name]: value });
  };

  const savePurchase = async (event) => {
    event.preventDefault();

    if (!purchaseForm.medicine_id || Number(purchaseForm.quantity) <= 0) {
      alert("Select a medicine and enter a valid quantity.");
      return;
    }

    try {
      const response = await axios.post(`${API}/api/purchases`, {
        ...purchaseForm,
        medicine_id: Number(purchaseForm.medicine_id),
        quantity: Number(purchaseForm.quantity),
        purchase_price: Number(purchaseForm.purchase_price) || 0,
      });

      alert(
        `Purchase recorded successfully.\n\nTotal cost: ₹${Number(
          response.data.totalCost || 0
        ).toFixed(2)}`
      );

      setShowPurchaseForm(false);
      setPurchaseForm({ ...emptyPurchase });
      await loadData();
    } catch (error) {
      alert(error.response?.data?.message || "Could not record purchase.");
    }
  };

  const openSale = (medicine = null) => {
    setSaleForm({
      ...emptySale,
      medicine_id: medicine?.id || "",
      selling_price: medicine?.price ?? "",
    });
    setShowSaleForm(true);
  };

  const handleSaleChange = (event) => {
    const { name, value } = event.target;

    if (name === "medicine_id") {
      const medicine = medicines.find(
        (item) => String(item.id) === String(value)
      );
      setSaleForm({
        ...saleForm,
        medicine_id: value,
        selling_price: medicine?.price ?? "",
      });
      return;
    }

    setSaleForm({ ...saleForm, [name]: value });
  };

  const saveSale = async (event) => {
    event.preventDefault();

    if (!saleForm.medicine_id || Number(saleForm.quantity) <= 0) {
      alert("Select a medicine and enter a valid quantity.");
      return;
    }

    try {
      const response = await axios.post(`${API}/api/sales`, {
        ...saleForm,
        medicine_id: Number(saleForm.medicine_id),
        quantity: Number(saleForm.quantity),
        selling_price: Number(saleForm.selling_price) || 0,
      });

      alert(
        `Sale completed.\n\nRevenue: ₹${Number(
          response.data.totalAmount || 0
        ).toFixed(2)}`
      );

      setShowSaleForm(false);
      setSaleForm({ ...emptySale });
      await loadData();
    } catch (error) {
      alert(error.response?.data?.message || "Could not complete sale.");
    }
  };

  const importExcel = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const data = new FormData();
    data.append("file", file);

    try {
      setImporting(true);
      const response = await axios.post(
        `${API}/api/medicines/import`,
        data
      );

      alert(
        `Excel import completed!\n\nImported: ${response.data.imported}\nSkipped: ${response.data.skipped}`
      );
      await loadData();
    } catch (error) {
      alert(error.response?.data?.message || "Excel import failed.");
    } finally {
      setImporting(false);
      event.target.value = "";
    }
  };

  const openHistory = async (medicine = null) => {
    try {
      const url = medicine
        ? `${API}/api/inventory-history/${medicine.id}`
        : `${API}/api/inventory-history`;

      const response = await axios.get(url);
      setHistory(response.data);
      setHistoryMedicine(medicine);
      setShowHistory(true);
    } catch {
      alert("Could not load stock history.");
    }
  };

  const getStockStatus = (medicine) => {
    if (medicine.quantity === 0) return ["Out of Stock", "danger"];
    if (medicine.quantity <= medicine.low_stock_limit)
      return ["Low Stock", "warning"];
    return ["In Stock", "good"];
  };

  const getExpiryStatus = (medicine) => {
    if (medicine.expiryStatus === "expired") return ["Expired", "danger"];
    if (medicine.expiryStatus === "expiring")
      return ["Expiring Soon", "warning"];
    if (medicine.expiryStatus === "safe") return ["Safe", "good"];
    return ["-", ""];
  };

  const filteredMedicines = useMemo(() => {
    const query = search.toLowerCase().trim();

    return medicines.filter((medicine) => {
      const matchesSearch =
        !query ||
        [medicine.name, medicine.company, medicine.batch, medicine.supplier]
          .join(" ")
          .toLowerCase()
          .includes(query);

      if (!matchesSearch) return false;

      if (filter === "low")
        return medicine.quantity > 0 &&
          medicine.quantity <= medicine.low_stock_limit;
      if (filter === "out") return medicine.quantity === 0;
      if (filter === "expiring") return medicine.expiryStatus === "expiring";
      if (filter === "expired") return medicine.expiryStatus === "expired";

      return true;
    });
  }, [medicines, search, filter]);

  const money = (value) =>
    `₹${Number(value || 0).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const formatDate = (value) => {
    if (!value) return "-";
    const date = new Date(String(value).replace(" ", "T") + "Z");
    return Number.isNaN(date.getTime())
      ? value
      : date.toLocaleString("en-IN", {
          dateStyle: "medium",
          timeStyle: "short",
        });
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">💊</div>
          <div>
            <h1>PharmaStock</h1>
            <p>Smart Pharmacy Inventory</p>
          </div>
        </div>

        <div className="top-actions">
          <input
            ref={fileInputRef}
            hidden
            type="file"
            accept=".xlsx,.xls"
            onChange={importExcel}
          />
          <button
            className="btn secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
          >
            {importing ? "Importing..." : "📊 Import Excel"}
          </button>
          <button className="btn secondary" onClick={() => openHistory()}>
            📋 History
          </button>
          <button className="btn secondary" onClick={() => setShowSales(true)}>
            💰 Sales
          </button>
          <button className="btn primary" onClick={openAddMedicine}>
            + Medicine
          </button>
        </div>
      </header>

      <main className="page">
        <section className="hero">
          <div>
            <span className="eyebrow">PHARMACY OPERATIONS</span>
            <h2>Good morning, manage your stock with confidence.</h2>
            <p>
              Track medicines, catch stock risks early and turn low inventory
              into clear reorder actions.
            </p>
          </div>
          <div className="hero-actions">
            <button className="btn primary" onClick={() => openPurchase()}>
              📦 Record Purchase
            </button>
            <button className="btn dark" onClick={() => openSale()}>
              💰 Record Sale
            </button>
          </div>
        </section>

        <section className="stats-grid">
          <Stat icon="💊" label="Medicines" value={stats.totalMedicines || 0} />
          <Stat icon="⚠️" label="Low Stock" value={stats.lowStock || 0} tone="warning" />
          <Stat icon="🚫" label="Out of Stock" value={stats.outOfStock || 0} tone="danger" />
          <Stat icon="⏳" label="Expiring Soon" value={stats.expiringSoon || 0} tone="orange" />
          <Stat icon="💰" label="Revenue" value={money(stats.totalRevenue)} tone="success" />
          <Stat icon="📦" label="Purchase Value" value={money(stats.totalPurchaseAmount)} tone="purple" />
        </section>

        <section className="insight-grid">
          <div className="panel reorder-panel">
            <div className="panel-head">
              <div>
                <span className="eyebrow">SMART INVENTORY</span>
                <h3>Smart Reorder</h3>
                <p>Prioritized medicines that need restocking.</p>
              </div>
              <span className="count-badge">{reorders.length}</span>
            </div>

            {reorders.length === 0 ? (
              <div className="empty-state compact">
                <span>✅</span>
                <strong>Stock levels look healthy</strong>
                <p>No medicine currently needs a reorder.</p>
              </div>
            ) : (
              <div className="reorder-list">
                {reorders.slice(0, 6).map((medicine) => (
                  <div className="reorder-item" key={medicine.id}>
                    <div className="medicine-mini">
                      <div className={`priority-dot ${medicine.urgency}`} />
                      <div>
                        <strong>{medicine.name}</strong>
                        <span>{medicine.supplier || "Supplier not added"}</span>
                      </div>
                    </div>
                    <div className="metric">
                      <span>Stock</span>
                      <strong>{medicine.quantity}</strong>
                    </div>
                    <div className="metric">
                      <span>Min</span>
                      <strong>{medicine.low_stock_limit}</strong>
                    </div>
                    <div className="metric order">
                      <span>Suggested</span>
                      <strong>{medicine.suggestedOrder}</strong>
                    </div>
                    <button
                      className="btn small primary"
                      onClick={() =>
                        openPurchase(medicine, medicine.suggestedOrder)
                      }
                    >
                      Purchase
                    </button>
                  </div>
                ))}
              </div>
            )}

            {reorders.length > 6 && (
              <button className="text-button" onClick={() => setFilter("low")}>
                View all reorder items →
              </button>
            )}
          </div>

          <div className="panel performance-panel">
            <div className="panel-head">
              <div>
                <span className="eyebrow">BUSINESS SNAPSHOT</span>
                <h3>Today at a glance</h3>
              </div>
            </div>
            <div className="performance-list">
              <div><span>Sales transactions</span><strong>{stats.totalSales || 0}</strong></div>
              <div><span>Units sold</span><strong>{stats.totalUnitsSold || 0}</strong></div>
              <div><span>Units purchased</span><strong>{stats.totalUnitsPurchased || 0}</strong></div>
              <div><span>Expired medicines</span><strong className="danger-text">{stats.expired || 0}</strong></div>
            </div>
            <div className="quick-actions">
              <button onClick={() => setShowPurchases(true)}>🧾 Purchase History</button>
              <button onClick={() => setShowSales(true)}>💰 Sales History</button>
              <button onClick={() => openHistory()}>📋 Stock History</button>
            </div>
          </div>
        </section>

        {(showMedicineForm || showPurchaseForm || showSaleForm) && (
          <div className="modal-overlay">
            <div className="modal">
              {showMedicineForm && (
                <>
                  <ModalHead
                    title={editingMedicine ? "Edit Medicine" : "Add Medicine"}
                    subtitle="Keep medicine and supplier information accurate."
                    onClose={closeMedicineForm}
                  />
                  <form onSubmit={saveMedicine}>
                    <div className="form-grid">
                      <Field label="Medicine name *">
                        <input name="name" value={medicineForm.name} onChange={(e) => setMedicineForm({ ...medicineForm, name: e.target.value })} required />
                      </Field>
                      <Field label="Company">
                        <input name="company" value={medicineForm.company} onChange={(e) => setMedicineForm({ ...medicineForm, company: e.target.value })} />
                      </Field>
                      <Field label="Batch">
                        <input name="batch" value={medicineForm.batch} onChange={(e) => setMedicineForm({ ...medicineForm, batch: e.target.value })} />
                      </Field>
                      <Field label="Current stock">
                        <input type="number" min="0" name="quantity" value={medicineForm.quantity} onChange={(e) => setMedicineForm({ ...medicineForm, quantity: e.target.value })} />
                      </Field>
                      <Field label="Selling price">
                        <input type="number" min="0" step="0.01" name="price" value={medicineForm.price} onChange={(e) => setMedicineForm({ ...medicineForm, price: e.target.value })} />
                      </Field>
                      <Field label="Expiry">
                        <input type="date" name="expiry" value={medicineForm.expiry} onChange={(e) => setMedicineForm({ ...medicineForm, expiry: e.target.value })} />
                      </Field>
                      <Field label="Low-stock level">
                        <input type="number" min="0" name="low_stock_limit" value={medicineForm.low_stock_limit} onChange={(e) => setMedicineForm({ ...medicineForm, low_stock_limit: e.target.value })} />
                      </Field>
                      <Field label="Suggested reorder quantity">
                        <input type="number" min="1" name="reorder_quantity" value={medicineForm.reorder_quantity} onChange={(e) => setMedicineForm({ ...medicineForm, reorder_quantity: e.target.value })} />
                      </Field>
                      <Field label="Supplier">
                        <input name="supplier" value={medicineForm.supplier} onChange={(e) => setMedicineForm({ ...medicineForm, supplier: e.target.value })} />
                      </Field>
                      <Field label="Supplier phone">
                        <input name="supplier_phone" value={medicineForm.supplier_phone} onChange={(e) => setMedicineForm({ ...medicineForm, supplier_phone: e.target.value })} />
                      </Field>
                    </div>
                    <ModalActions onCancel={closeMedicineForm} submit={editingMedicine ? "Update Medicine" : "Save Medicine"} />
                  </form>
                </>
              )}

              {showPurchaseForm && (
                <>
                  <ModalHead title="📦 Record Purchase" subtitle="Add stock and automatically update inventory." onClose={() => setShowPurchaseForm(false)} />
                  <form onSubmit={savePurchase}>
                    <div className="form-grid">
                      <Field label="Medicine *">
                        <select name="medicine_id" value={purchaseForm.medicine_id} onChange={handlePurchaseChange} required>
                          <option value="">Select medicine</option>
                          {medicines.map((medicine) => <option key={medicine.id} value={medicine.id}>{medicine.name} — Stock {medicine.quantity}</option>)}
                        </select>
                      </Field>
                      <Field label="Quantity *">
                        <input type="number" min="1" name="quantity" value={purchaseForm.quantity} onChange={handlePurchaseChange} required />
                      </Field>
                      <Field label="Purchase price / unit">
                        <input type="number" min="0" step="0.01" name="purchase_price" value={purchaseForm.purchase_price} onChange={handlePurchaseChange} required />
                      </Field>
                      <Field label="Purchase date">
                        <input type="date" name="purchase_date" value={purchaseForm.purchase_date} onChange={handlePurchaseChange} required />
                      </Field>
                      <Field label="Supplier">
                        <input name="supplier" value={purchaseForm.supplier} onChange={handlePurchaseChange} />
                      </Field>
                      <Field label="Supplier phone">
                        <input name="supplier_phone" value={purchaseForm.supplier_phone} onChange={handlePurchaseChange} />
                      </Field>
                      <Field label="Invoice number">
                        <input name="invoice_number" value={purchaseForm.invoice_number} onChange={handlePurchaseChange} />
                      </Field>
                      <Field label="Notes">
                        <input name="notes" value={purchaseForm.notes} onChange={handlePurchaseChange} />
                      </Field>
                    </div>
                    <ModalActions onCancel={() => setShowPurchaseForm(false)} submit="Save Purchase" />
                  </form>
                </>
              )}

              {showSaleForm && (
                <>
                  <ModalHead title="💰 Record Sale" subtitle="Complete a sale and reduce stock safely." onClose={() => setShowSaleForm(false)} />
                  <form onSubmit={saveSale}>
                    <div className="form-grid">
                      <Field label="Medicine *">
                        <select name="medicine_id" value={saleForm.medicine_id} onChange={handleSaleChange} required>
                          <option value="">Select medicine</option>
                          {medicines.map((medicine) => <option key={medicine.id} value={medicine.id}>{medicine.name} — Stock {medicine.quantity}</option>)}
                        </select>
                      </Field>
                      <Field label="Quantity *">
                        <input type="number" min="1" name="quantity" value={saleForm.quantity} onChange={handleSaleChange} required />
                      </Field>
                      <Field label="Selling price / unit">
                        <input type="number" min="0" step="0.01" name="selling_price" value={saleForm.selling_price} onChange={handleSaleChange} required />
                      </Field>
                      <Field label="Sale date">
                        <input type="date" name="sale_date" value={saleForm.sale_date} onChange={handleSaleChange} required />
                      </Field>
                      <Field label="Customer name">
                        <input name="customer_name" value={saleForm.customer_name} onChange={handleSaleChange} />
                      </Field>
                      <Field label="Customer phone">
                        <input name="customer_phone" value={saleForm.customer_phone} onChange={handleSaleChange} />
                      </Field>
                      <Field label="Notes">
                        <input name="notes" value={saleForm.notes} onChange={handleSaleChange} />
                      </Field>
                    </div>
                    <ModalActions onCancel={() => setShowSaleForm(false)} submit="Complete Sale" />
                  </form>
                </>
              )}
            </div>
          </div>
        )}

        <section className="panel inventory-panel">
          <div className="panel-head inventory-head">
            <div>
              <span className="eyebrow">INVENTORY</span>
              <h3>Medicine Inventory</h3>
              <p>Search, monitor and manage every medicine.</p>
            </div>
            <div className="search-wrap">
              <span>⌕</span>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search medicine, company, batch..." />
            </div>
          </div>

          <div className="filters">
            {[
              ["all", "All"],
              ["low", "🟡 Low"],
              ["out", "🔴 Out"],
              ["expiring", "🟠 Expiring"],
              ["expired", "❌ Expired"],
            ].map(([value, label]) => (
              <button key={value} className={filter === value ? "filter active" : "filter"} onClick={() => setFilter(value)}>
                {label}
              </button>
            ))}
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Medicine</th>
                  <th>Stock</th>
                  <th>Supplier</th>
                  <th>Price</th>
                  <th>Expiry</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredMedicines.length === 0 ? (
                  <tr><td colSpan="7"><div className="empty-state"><span>🔎</span><strong>No medicines found</strong><p>Try another search or filter.</p></div></td></tr>
                ) : filteredMedicines.map((medicine) => {
                  const [stockText, stockClass] = getStockStatus(medicine);
                  const [expiryText, expiryClass] = getExpiryStatus(medicine);

                  return (
                    <tr key={medicine.id}>
                      <td>
                        <div className="medicine-cell">
                          <div className="medicine-avatar">💊</div>
                          <div>
                            <strong>{medicine.name}</strong>
                            <span>{medicine.company || "Company not added"} • Batch {medicine.batch || "-"}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="stock-control">
                          <button onClick={() => changeStock(medicine, "decrease")}>−</button>
                          <strong>{medicine.quantity}</strong>
                          <button onClick={() => changeStock(medicine, "increase")}>+</button>
                        </div>
                        <small>Min {medicine.low_stock_limit}</small>
                      </td>
                      <td>
                        <strong>{medicine.supplier || "Not added"}</strong>
                        <small>{medicine.supplier_phone || ""}</small>
                      </td>
                      <td>{money(medicine.price)}</td>
                      <td>
                        <strong>{medicine.expiry || "-"}</strong>
                        {medicine.daysUntilExpiry !== null && medicine.expiry && <small>{medicine.daysUntilExpiry >= 0 ? `${medicine.daysUntilExpiry} days left` : `${Math.abs(medicine.daysUntilExpiry)} days overdue`}</small>}
                      </td>
                      <td>
                        <div className="status-stack">
                          <span className={`status ${stockClass}`}>{stockText}</span>
                          {expiryClass && <span className={`status ${expiryClass}`}>{expiryText}</span>}
                        </div>
                      </td>
                      <td>
                        <div className="row-actions">
                          <button title="Purchase" onClick={() => openPurchase(medicine)}>📦</button>
                          <button title="Sell" onClick={() => openSale(medicine)}>💰</button>
                          <button title="History" onClick={() => openHistory(medicine)}>📋</button>
                          <button title="Edit" onClick={() => openEditMedicine(medicine)}>✏️</button>
                          <button title="Delete" onClick={() => deleteMedicine(medicine.id)}>🗑️</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {showHistory && (
          <section className="panel lower-panel">
            <div className="panel-head">
              <div>
                <span className="eyebrow">AUDIT TRAIL</span>
                <h3>{historyMedicine ? `${historyMedicine.name} History` : "Inventory History"}</h3>
                <p>Every stock movement recorded by PharmaStock.</p>
              </div>
              <button className="btn secondary" onClick={() => setShowHistory(false)}>Close</button>
            </div>
            <HistoryList history={history} formatDate={formatDate} />
          </section>
        )}

        {showPurchases && (
          <section className="panel lower-panel">
            <div className="panel-head">
              <div><span className="eyebrow">PROCUREMENT</span><h3>Purchase History</h3><p>All recorded stock purchases.</p></div>
              <button className="btn secondary" onClick={() => setShowPurchases(false)}>Close</button>
            </div>
            <div className="simple-list">
              {purchases.length === 0 ? <div className="empty-state"><span>📦</span><strong>No purchases yet</strong></div> :
                purchases.slice(0, 50).map((item) => (
                  <div className="simple-row" key={item.id}>
                    <div><strong>{item.medicine_name}</strong><span>{item.purchase_date} • {item.supplier || "Supplier not added"}</span></div>
                    <strong>+{item.quantity}</strong>
                    <strong>{money(item.quantity * item.purchase_price)}</strong>
                  </div>
                ))}
            </div>
          </section>
        )}

        {showSales && (
          <section className="panel lower-panel">
            <div className="panel-head">
              <div><span className="eyebrow">SALES</span><h3>Sales History</h3><p>Recent completed sales and revenue.</p></div>
              <div className="head-actions">
                <button className="btn dark" onClick={() => openSale()}>+ Record Sale</button>
                <button className="btn secondary" onClick={() => setShowSales(false)}>Close</button>
              </div>
            </div>
            <div className="simple-list">
              {sales.length === 0 ? <div className="empty-state"><span>💰</span><strong>No sales yet</strong></div> :
                sales.slice(0, 50).map((item) => (
                  <div className="simple-row" key={item.id}>
                    <div><strong>{item.medicine_name}</strong><span>{item.sale_date} • {item.customer_name || "Walk-in customer"}</span></div>
                    <strong>-{item.quantity}</strong>
                    <strong>{money(item.total_amount)}</strong>
                  </div>
                ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function Stat({ icon, label, value, tone = "" }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${tone}`}>{icon}</div>
      <div><span>{label}</span><strong>{value}</strong></div>
    </div>
  );
}

function Field({ label, children }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

function ModalHead({ title, subtitle, onClose }) {
  return (
    <div className="modal-head">
      <div><span className="eyebrow">PHARMASTOCK</span><h3>{title}</h3><p>{subtitle}</p></div>
      <button className="close-btn" onClick={onClose}>×</button>
    </div>
  );
}

function ModalActions({ onCancel, submit }) {
  return <div className="modal-actions"><button type="button" className="btn secondary" onClick={onCancel}>Cancel</button><button type="submit" className="btn primary">{submit}</button></div>;
}

function HistoryList({ history, formatDate }) {
  if (!history.length) return <div className="empty-state"><span>📋</span><strong>No stock history</strong><p>Stock movements will appear here.</p></div>;

  return (
    <div className="history-list">
      {history.map((item) => (
        <div className="history-row" key={item.id}>
          <div className={`history-icon ${item.quantity_change >= 0 ? "positive-bg" : "negative-bg"}`}>
            {item.quantity_change >= 0 ? "↑" : "↓"}
          </div>
          <div className="history-main"><strong>{item.medicine_name}</strong><span>{item.action} • {item.reason || "Stock movement"}</span></div>
          <strong className={item.quantity_change >= 0 ? "positive" : "negative"}>{item.quantity_change >= 0 ? "+" : ""}{item.quantity_change}</strong>
          <span>{item.quantity_before} → {item.quantity_after}</span>
          <small>{formatDate(item.created_at)}</small>
        </div>
      ))}
    </div>
  );
}

export default App;

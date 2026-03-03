import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { CartItemWithProduct } from "@/contexts/CartContext";
import { TAX_RATE, TAX_RATE_DISPLAY, TAX_JURISDICTION, calculateTax } from "@shared/taxConfig";

interface OrderForPDF {
  id: number;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  vehicleInfo: string | null;
  notes: string | null;
  cartItems: any[];
  cartTotal: string | null;
  taxRate: string | null;
  taxAmount: string | null;
  itemCount: number;
  status: string;
  createdByName: string | null;
  createdAt: string;
}

export function generateOrderPDF(order: OrderForPDF) {
  const doc = new jsPDF();
  
  // Header
  doc.setFontSize(20);
  doc.setTextColor(30, 144, 255); // Thunder Customs blue
  doc.text("THUNDER CUSTOMS", 105, 20, { align: "center" });
  
  doc.setFontSize(14);
  doc.setTextColor(0, 0, 0);
  doc.text(`Order #${order.id}`, 105, 30, { align: "center" });
  
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  const orderDate = new Date(order.createdAt).toLocaleDateString();
  doc.text(`Created: ${orderDate}`, 105, 37, { align: "center" });
  
  // Customer Info Section
  let yPos = 50;
  doc.setFontSize(12);
  doc.setTextColor(30, 144, 255);
  doc.text("Customer Information", 14, yPos);
  
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  yPos += 8;
  doc.text(`Name: ${order.customerName}`, 14, yPos);
  
  if (order.customerEmail) {
    yPos += 6;
    doc.text(`Email: ${order.customerEmail}`, 14, yPos);
  }
  
  if (order.customerPhone) {
    yPos += 6;
    doc.text(`Phone: ${order.customerPhone}`, 14, yPos);
  }
  
  if (order.vehicleInfo) {
    yPos += 6;
    doc.text(`Vehicle: ${order.vehicleInfo}`, 14, yPos);
  }
  
  // Status and Sales Rep
  yPos += 10;
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  const statusLabel = order.status.charAt(0).toUpperCase() + order.status.slice(1);
  doc.text(`Status: ${statusLabel}`, 14, yPos);
  
  if (order.createdByName) {
    yPos += 6;
    doc.text(`Sales Rep: ${order.createdByName}`, 14, yPos);
  }
  
  // Helper to parse price strings that may contain $ or other characters
  const parsePrice = (priceStr: string | number | null | undefined): number => {
    if (priceStr === null || priceStr === undefined || priceStr === "N/A") return 0;
    const cleaned = String(priceStr).replace(/[^0-9.-]/g, '');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  };

  // Order Items Table
  yPos += 12;
  const tableData = order.cartItems.map((item: any) => {
    const rawPrice = item.product?.price || item.price || null;
    const price = parsePrice(rawPrice);
    const subtotal = price * item.quantity;
    return [
      item.product?.partNumber || item.partNumber || "-",
      item.product?.partName || item.partName || "Unknown Item",
      item.product?.manufacturer || item.manufacturer || "-",
      item.quantity.toString(),
      price > 0 ? `$${price.toFixed(2)}` : "N/A",
      subtotal > 0 ? `$${subtotal.toFixed(2)}` : "N/A",
    ];
  });

  autoTable(doc, {
    startY: yPos,
    head: [["Part #", "Part Name", "Manufacturer", "Qty", "Price", "Subtotal"]],
    body: tableData,
    theme: "grid",
    headStyles: {
      fillColor: [30, 144, 255],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 9,
    },
    bodyStyles: {
      fontSize: 8,
    },
    columnStyles: {
      0: { cellWidth: 28 },
      1: { cellWidth: 55 },
      2: { cellWidth: 30 },
      3: { cellWidth: 15, halign: "center" },
      4: { cellWidth: 22, halign: "right" },
      5: { cellWidth: 25, halign: "right" },
    },
    margin: { left: 14, right: 14 },
  });
  
  const finalY = (doc as any).lastAutoTable.finalY || yPos + 50;
  let summaryY = finalY + 10;
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  doc.text(`Total Items: ${order.itemCount}`, 14, summaryY);
  
  if (order.cartTotal) {
    summaryY += 8;
    if (order.taxAmount) {
      const subtotal = parseFloat(order.cartTotal) - parseFloat(order.taxAmount);
      doc.setFontSize(11);
      doc.setTextColor(80, 80, 80);
      doc.text(`Subtotal: $${subtotal.toFixed(2)}`, 14, summaryY);
      summaryY += 7;
      const taxLabel = order.taxRate ? `${TAX_JURISDICTION} Tax (${(parseFloat(order.taxRate) * 100).toFixed(0)}%)` : `${TAX_JURISDICTION} Tax (${TAX_RATE_DISPLAY})`;
      doc.text(`${taxLabel}: $${parseFloat(order.taxAmount).toFixed(2)}`, 14, summaryY);
      summaryY += 7;
    }
    doc.setFontSize(14);
    doc.setTextColor(30, 144, 255);
    doc.text(`Order Total: $${parseFloat(order.cartTotal).toFixed(2)}`, 14, summaryY);
    summaryY += 4;
  }
  
  if (order.notes) {
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text("Notes:", 14, summaryY + 8);
    doc.setTextColor(0, 0, 0);
    const splitNotes = doc.splitTextToSize(order.notes, 180);
    doc.text(splitNotes, 14, summaryY + 14);
  }

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      "Thunder Chrysler Dodge Jeep Ram - Automotive Accessories Department",
      105,
      285,
      { align: "center" }
    );
    doc.text(`Page ${i} of ${pageCount}`, 105, 290, { align: "center" });
  }

  // Save the PDF
  const fileName = `Thunder_Customs_Order_${order.id}_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
}

export function generateShoppingListPDF(items: CartItemWithProduct[]) {
  const doc = new jsPDF();
  
  // Header
  doc.setFontSize(20);
  doc.setTextColor(30, 144, 255); // Thunder Customs blue
  doc.text("THUNDER CUSTOMS", 105, 20, { align: "center" });
  
  doc.setFontSize(14);
  doc.setTextColor(0, 0, 0);
  doc.text("Quote Request List", 105, 30, { align: "center" });
  
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`Generated on ${new Date().toLocaleDateString()}`, 105, 37, { align: "center" });
  
  const parsePrice = (priceStr: string | number | null | undefined): number => {
    if (priceStr === null || priceStr === undefined || priceStr === "N/A") return 0;
    const cleaned = String(priceStr).replace(/[^0-9.-]/g, '');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  };

  const tableData = items.map((item) => {
    const price = parsePrice(item.product.price);
    const subtotal = price * item.quantity;
    return [
      item.product.partNumber,
      item.product.partName,
      item.product.manufacturer,
      item.quantity.toString(),
      price > 0 ? `$${price.toFixed(2)}` : "Quote",
      subtotal > 0 ? `$${subtotal.toFixed(2)}` : "Quote",
    ];
  });

  autoTable(doc, {
    startY: 45,
    head: [["Part #", "Part Name", "Manufacturer", "Qty", "Price", "Subtotal"]],
    body: tableData,
    theme: "grid",
    headStyles: {
      fillColor: [30, 144, 255],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 10,
    },
    bodyStyles: {
      fontSize: 9,
    },
    columnStyles: {
      0: { cellWidth: 28 },
      1: { cellWidth: 60 },
      2: { cellWidth: 30 },
      3: { cellWidth: 15, halign: "center" },
      4: { cellWidth: 22, halign: "right" },
      5: { cellWidth: 25, halign: "right" },
    },
    margin: { left: 10, right: 10 },
  });

  const finalY = (doc as any).lastAutoTable.finalY || 95;
  const subtotalPrice = items.reduce((sum, item) => {
    const price = parsePrice(item.product.price);
    return sum + (price * item.quantity);
  }, 0);
  
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text(`Total Items: ${items.reduce((sum, item) => sum + item.quantity, 0)}`, 14, finalY + 10);
  
  if (subtotalPrice > 0) {
    const taxAmt = calculateTax(subtotalPrice);
    const total = subtotalPrice + taxAmt;
    doc.setFontSize(11);
    doc.setTextColor(80, 80, 80);
    doc.text(`Subtotal: $${subtotalPrice.toFixed(2)}`, 14, finalY + 18);
    doc.text(`${TAX_JURISDICTION} Tax (${TAX_RATE_DISPLAY}): $${taxAmt.toFixed(2)}`, 14, finalY + 25);
    doc.setFontSize(12);
    doc.setTextColor(30, 144, 255);
    doc.text(`Estimated Total: $${total.toFixed(2)}`, 14, finalY + 33);
  }

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      "Thunder Chrysler Dodge Jeep Ram - Automotive Accessories Department",
      105,
      285,
      { align: "center" }
    );
    doc.text(`Page ${i} of ${pageCount}`, 105, 290, { align: "center" });
  }

  // Save the PDF
  const fileName = `Thunder_Customs_Quote_Request_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
}

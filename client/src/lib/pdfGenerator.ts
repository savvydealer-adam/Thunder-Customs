import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { CartItemWithProduct } from "@/contexts/CartContext";

export function generateShoppingListPDF(items: CartItemWithProduct[]) {
  const doc = new jsPDF();
  
  // Header
  doc.setFontSize(20);
  doc.setTextColor(30, 144, 255); // Thunder Customs blue
  doc.text("THUNDER CUSTOMS", 105, 20, { align: "center" });
  
  doc.setFontSize(14);
  doc.setTextColor(0, 0, 0);
  doc.text("Shopping List", 105, 30, { align: "center" });
  
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`Generated on ${new Date().toLocaleDateString()}`, 105, 37, { align: "center" });
  
  // Table data
  const tableData = items.map((item) => {
    const price = item.product.price ? parseFloat(item.product.price) : 0;
    const total = price * item.quantity;
    
    return [
      item.product.partNumber,
      item.product.partName,
      item.product.manufacturer,
      item.product.category,
      item.quantity.toString(),
      price > 0 ? `$${price.toFixed(2)}` : "N/A",
      price > 0 ? `$${total.toFixed(2)}` : "N/A",
    ];
  });

  // Add table
  autoTable(doc, {
    startY: 45,
    head: [["Part #", "Part Name", "Manufacturer", "Category", "Qty", "Price", "Total"]],
    body: tableData,
    theme: "grid",
    headStyles: {
      fillColor: [30, 144, 255], // Thunder Customs blue
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 10,
    },
    bodyStyles: {
      fontSize: 9,
    },
    columnStyles: {
      0: { cellWidth: 25 }, // Part #
      1: { cellWidth: 50 }, // Part Name
      2: { cellWidth: 30 }, // Manufacturer
      3: { cellWidth: 28 }, // Category
      4: { cellWidth: 15, halign: "center" }, // Qty
      5: { cellWidth: 20, halign: "right" }, // Price
      6: { cellWidth: 22, halign: "right" }, // Total
    },
    margin: { left: 10, right: 10 },
  });

  // Calculate subtotal
  const subtotal = items.reduce((sum, item) => {
    const price = item.product.price ? parseFloat(item.product.price) : 0;
    return sum + price * item.quantity;
  }, 0);

  // Add subtotal if prices are available
  if (subtotal > 0) {
    const finalY = (doc as any).lastAutoTable.finalY || 45;
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text(`Subtotal: $${subtotal.toFixed(2)}`, 190, finalY + 10, { align: "right" });
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text("Final pricing and availability to be confirmed at dealership", 105, finalY + 20, { align: "center" });
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
  const fileName = `Thunder_Customs_Shopping_List_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
}

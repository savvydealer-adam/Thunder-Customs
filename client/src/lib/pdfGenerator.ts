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
  doc.text("Quote Request List", 105, 30, { align: "center" });
  
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`Generated on ${new Date().toLocaleDateString()}`, 105, 37, { align: "center" });
  
  // Table data
  const tableData = items.map((item) => {
    return [
      item.product.partNumber,
      item.product.partName,
      item.product.manufacturer,
      item.product.category,
      item.quantity.toString(),
    ];
  });

  // Add table
  autoTable(doc, {
    startY: 45,
    head: [["Part #", "Part Name", "Manufacturer", "Category", "Qty"]],
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
      0: { cellWidth: 30 }, // Part #
      1: { cellWidth: 70 }, // Part Name
      2: { cellWidth: 35 }, // Manufacturer
      3: { cellWidth: 35 }, // Category
      4: { cellWidth: 20, halign: "center" }, // Qty
    },
    margin: { left: 10, right: 10 },
  });

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

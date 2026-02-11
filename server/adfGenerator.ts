interface CartItemData {
  product: {
    id: number;
    partNumber: string;
    partName: string;
    manufacturer: string;
    category: string;
    price?: string | null;
  };
  quantity: number;
}

interface LeadData {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  comments?: string | null;
  cartItems: CartItemData[];
  cartTotal?: string | null;
  leadId?: number;
}

export function generateAdfXml(lead: LeadData): string {
  const timestamp = new Date().toISOString();
  
  const escapeXml = (str: string | null | undefined): string => {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  };

  const itemsDescription = lead.cartItems.map(item => 
    `${item.quantity}x ${item.product.partNumber} - ${item.product.partName} (${item.product.manufacturer})`
  ).join('\n');

  const totalPrice = lead.cartTotal || lead.cartItems.reduce((sum, item) => {
    const price = item.product.price ? parseFloat(item.product.price) : 0;
    return sum + (price * item.quantity);
  }, 0).toFixed(2);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?adf version="1.0"?>
<adf>
  <prospect status="new">
    <id sequence="1" source="Thunder Customs Website">${lead.leadId || Date.now()}</id>
    <requestdate>${timestamp}</requestdate>
    <customer>
      <contact>
        <name part="first">${escapeXml(lead.firstName)}</name>
        <name part="last">${escapeXml(lead.lastName)}</name>
        <email>${escapeXml(lead.email)}</email>
        ${lead.phone ? `<phone type="voice">${escapeXml(lead.phone)}</phone>` : ''}
      </contact>
      <comments>${escapeXml(lead.comments || '')}</comments>
    </customer>
    <vendor>
      <vendorname>Thunder Customs</vendorname>
      <contact>
        <name part="full">Thunder Customs Sales</name>
      </contact>
    </vendor>
    <provider>
      <name part="full">Thunder Customs Website</name>
      <service>Parts Request</service>
      <url>https://thundercustoms.com</url>
    </provider>
    <vehicle interest="buy" status="new">
      <price type="quote" currency="USD">${totalPrice}</price>
      <comments>
Parts Request:
${escapeXml(itemsDescription)}

Total: $${totalPrice}
      </comments>
    </vehicle>
  </prospect>
</adf>`;

  return xml;
}

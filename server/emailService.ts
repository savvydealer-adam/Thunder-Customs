import { Resend } from 'resend';

let resendClient: Resend | null = null;

function getResendClient(): Resend | null {
  if (!process.env.RESEND_API_KEY) {
    return null;
  }
  if (!resendClient) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

interface LeadEmailData {
  leadId: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  preferredContact: string;
  vehicleInfo?: string | null;
  comments?: string | null;
  itemCount: number;
  cartItems: Array<{
    product: {
      partNumber: string;
      partName: string;
      manufacturer: string;
      category: string;
    };
    quantity: number;
  }>;
}

export async function sendLeadNotification(data: LeadEmailData): Promise<boolean> {
  const toEmail = process.env.TO_EMAIL;
  
  if (!toEmail) {
    console.error('TO_EMAIL environment variable not set');
    return false;
  }

  const resend = getResendClient();
  if (!resend) {
    console.error('RESEND_API_KEY environment variable not set');
    return false;
  }

  const itemsList = data.cartItems
    .map(item => `• ${item.product.partName} (${item.product.partNumber}) - Qty: ${item.quantity}`)
    .join('\n');

  const htmlItemsList = data.cartItems
    .map(item => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #eee;">${item.product.partNumber}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee;">${item.product.partName}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee;">${item.product.manufacturer}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
      </tr>
    `)
    .join('');

  try {
    const { error } = await resend.emails.send({
      from: 'Thunder Customs <onboarding@resend.dev>',
      to: toEmail,
      subject: `New Quote Request from ${data.firstName} ${data.lastName} - ${data.itemCount} items`,
      text: `
New Quote Request Received

Lead ID: #${data.leadId}

Customer Information:
---------------------
Name: ${data.firstName} ${data.lastName}
Email: ${data.email}
Phone: ${data.phone}
Preferred Contact: ${data.preferredContact}
${data.vehicleInfo ? `Vehicle: ${data.vehicleInfo}` : ''}
${data.comments ? `Comments: ${data.comments}` : ''}

Items Requested (${data.itemCount} total):
------------------------------------------
${itemsList}

---
View and manage this lead in the Thunder Customs admin panel.
      `,
      html: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .header { background: linear-gradient(135deg, #1E90FF, #0066CC); color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; }
    .section { margin-bottom: 20px; }
    .section-title { font-size: 16px; font-weight: bold; color: #1E90FF; margin-bottom: 10px; border-bottom: 2px solid #1E90FF; padding-bottom: 5px; }
    .info-row { margin: 8px 0; }
    .label { font-weight: bold; color: #666; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th { background: #f5f5f5; padding: 10px 8px; text-align: left; font-weight: bold; }
    .footer { background: #f5f5f5; padding: 15px; text-align: center; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="header">
    <h1 style="margin: 0;">New Quote Request</h1>
    <p style="margin: 5px 0 0 0;">Lead #${data.leadId}</p>
  </div>
  
  <div class="content">
    <div class="section">
      <div class="section-title">Customer Information</div>
      <div class="info-row"><span class="label">Name:</span> ${data.firstName} ${data.lastName}</div>
      <div class="info-row"><span class="label">Email:</span> <a href="mailto:${data.email}">${data.email}</a></div>
      <div class="info-row"><span class="label">Phone:</span> <a href="tel:${data.phone}">${data.phone}</a></div>
      <div class="info-row"><span class="label">Preferred Contact:</span> ${data.preferredContact}</div>
      ${data.vehicleInfo ? `<div class="info-row"><span class="label">Vehicle:</span> ${data.vehicleInfo}</div>` : ''}
      ${data.comments ? `<div class="info-row"><span class="label">Comments:</span> ${data.comments}</div>` : ''}
    </div>
    
    <div class="section">
      <div class="section-title">Items Requested (${data.itemCount} total)</div>
      <table>
        <thead>
          <tr>
            <th>Part #</th>
            <th>Part Name</th>
            <th>Manufacturer</th>
            <th style="text-align: center;">Qty</th>
          </tr>
        </thead>
        <tbody>
          ${htmlItemsList}
        </tbody>
      </table>
    </div>
  </div>
  
  <div class="footer">
    <p>This email was sent from Thunder Customs Automotive Parts Catalog</p>
    <p>View and manage leads in the admin panel</p>
  </div>
</body>
</html>
      `,
    });

    if (error) {
      console.error('Failed to send lead notification email:', error);
      return false;
    }

    console.log(`Lead notification email sent for lead #${data.leadId}`);
    return true;
  } catch (error) {
    console.error('Error sending lead notification email:', error);
    return false;
  }
}

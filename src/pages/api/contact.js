import { env as cfEnv } from "cloudflare:workers";

export const prerender = false; // Ensures this route runs on Cloudflare Workers edge

export async function POST({ request, locals }) {
  try {
    const data = await request.json();
    const { name, email, phone, description } = data;

    // Validate inputs
    if (!name || !email || !description) {
      return new Response(JSON.stringify({ error: "Missing required fields." }), { 
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Astro v6 exposes Cloudflare dashboard bindings dynamically via `import { env } from "cloudflare:workers"`
    // We create a safety chain for local dev vs production edge scenarios
    const safeCfEnv = cfEnv || {};
    
    const BREVO_API_KEY = safeCfEnv.BREVO_API_KEY || import.meta.env.BREVO_API_KEY || (typeof process !== "undefined" ? process.env.BREVO_API_KEY : null) || "YOUR_FALLBACK_KEY";
    const SENDER_EMAIL = safeCfEnv.SENDER_EMAIL || import.meta.env.SENDER_EMAIL || (typeof process !== "undefined" ? process.env.SENDER_EMAIL : null) || "intake@walkfreelaw.com";
    const DESTINATION_EMAIL = safeCfEnv.DESTINATION_EMAIL || import.meta.env.DESTINATION_EMAIL || (typeof process !== "undefined" ? process.env.DESTINATION_EMAIL : null) || "intake@walkfreelaw.com";

    // Format the email
    const htmlEmail = `
      <h2>New Case Review Request (Amazon DD+7)</h2>
      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Phone:</strong> ${phone || 'Not provided'}</p>
      <br />
      <h3>Issue Description:</h3>
      <p>${description.replace(/\n/g, '<br />')}</p>
    `;

    // Dispatch to Brevo HTTP API natively on Edge (bypassing SMTP TCP restrictions)
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': BREVO_API_KEY
      },
      body: JSON.stringify({
        sender: { name: "Website Intake", email: SENDER_EMAIL },
        to: [{ email: DESTINATION_EMAIL }],
        subject: `New Intake: Amazon DD+7 Dispute (${name})`,
        htmlContent: htmlEmail
      })
    });

    if (response.ok) {
      return new Response(JSON.stringify({ success: true, message: "Message sent safely." }), { 
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    } else {
      const body = await response.json();
      console.error("Brevo Error:", body);
      // Pass the specific Brevo message back so we can see if it's a verification block or key mismatch
      return new Response(JSON.stringify({ error: `Brevo API Error: ${body.message || 'Unknown provider error'}` }), { 
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
  } catch (err) {
    console.error("API Error Server-side:", err);
    return new Response(JSON.stringify({ error: `Server Crash: ${err.message || String(err)}` }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

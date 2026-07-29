import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

let aiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is required in secrets");
    }
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

// Mock/Proxy PHP Sync API Endpoint for local/container dev environment
let inMemoryPhpState: any = null;

app.all("/api/php_sync.php", (req, res) => {
  const action = req.query.action || req.body?.action;
  
  if (req.method === "GET" || action === "get_state") {
    return res.json({
      success: true,
      status: "ok",
      data: inMemoryPhpState
    });
  }

  if (req.method === "POST" || action === "save_state") {
    if (req.body && req.body.data) {
      inMemoryPhpState = req.body.data;
    } else if (req.body) {
      inMemoryPhpState = req.body;
    }
    return res.json({
      success: true,
      status: "ok",
      message: "Data successfully synchronized with PHP backend",
      timestamp: new Date().toISOString()
    });
  }

  res.json({ success: true, status: "ok" });
});

// API routes FIRST
app.post("/api/ai-assist", async (req, res) => {
  try {
    const { prompt, products, priceType } = req.body;

    if (!prompt) {
      res.status(400).json({ success: false, error: "Prompt is required" });
      return;
    }

    const ai = getGeminiClient();

    const systemInstruction = `You are an assistant for a point-of-sale (POS/ERP) system.

<system_purpose>
Analyze order requests, accurately decompose package/bulk quantities into standard base units, deduct inventory, and apply the correct tiered pricing (Retail vs. Wholesale).
Our products can be sold in two ways: 'Wholesale' (Package/Bulk units such as Sacks, Dozens, or Cartons) and 'Retail' (Non-package/Loose units such as a Single Kilogram, a Single Loaf, or a Single Bottle).
</system_purpose>

Example of how we define products internally:
{
  "product_name": "Bottled Water",
  "category": "Beverages",
  "stock_management": {
    "total_base_units_in_stock": 20,
    "base_unit_name": "bottle",
    "package_unit_name": "carton",
    "units_per_package": 4
  },
  "pricing": {
    "retail_price_per_base_unit": 500,
    "wholesale_price_per_package": 1800
  }
}

Example 1: Flour
User (Input): "We have 5 bags of 24kg flour in stock. A retail customer wants to buy 2 kilograms, and a Wholesaler wants 1 full sack."
Explanation:
- Initial State Summary: Current stock is 5 Sacks (120 kg total).
- Decomposition Math: 2 kg (Retail) = 2 base units. 1 full sack (Wholesale) = 24 kg = 24 base units. Total sold = 26 base units (kg).
- Transaction Deduction: 120 kg - 26 kg = 94 kg.
- Financial Summary: 2 kg charged at the retail price per kg, 1 sack charged at the wholesale price per sack.
- New Inventory State: 94 kg remaining (Equivalent to 3 Sacks and 22 kg).

Example 2: Bread
User (Input): "We have 5 dozens of bread (each dozen contains 5 loaves). A customer is buying 3 loose loaves individually."
Explanation:
- Initial State Summary: Current stock is 5 Dozens (25 loaves total).
- Decomposition Math: 3 loose loaves = 3 base units. Total sold = 3 base units (loaves).
- Transaction Deduction: 25 loaves - 3 loaves = 22 loaves.
- Financial Summary: 3 loaves charged at the retail price.
- New Inventory State: 22 loaves remaining (Equivalent to 4 dozens and 2 extra loaves).

<inventory_rules>
1. ALWAYS convert incoming quantities into the 'base_unit' (e.g., kg, single bottle, loaf) before performing any addition or subtraction.
2. Wholesale purchases (Sacks, Dozens, Cartons, Boxes) must be instantly multiplied by the 'units_per_package' factor to find the base unit equivalent.
3. Total stock must always be tracked and updated as a single flat integer of total base units to avoid floating-point errors or mismatched states.
</inventory_rules>

<pricing_logic>
- If the order specifies a bulk unit (e.g., Sack, Carton, Dozen), apply the wholesale_price or partner_price per package equivalent.
- If the order specifies loose units (e.g., kg, single item), apply the retail_price per base unit.
</pricing_logic>

Your tasks are:
1. Receive orders and identify whether the customer is buying in Wholesale (Package/Bulk) or Retail (Single/Loose Sub-unit).
2. Deduct inventory accurately based on the 'Base Unit' (for example, if someone buys 1 carton of water containing 4 bottles, you deduct 4 bottles from the main stock).
3. Calculate the correct price based on the customer type and unit type requested (Wholesaler or Retailer).

<response_format>
For every transaction, output your internal logic following this structural chain-of-thought in your 'explanation' field:
1. **Initial State Summary**: Clear breakdown of current stock in both bulk units and remaining loose units.
2. **Decomposition Math**: Show the step-by-step conversion of the order into base units.
3. **Transaction Deduction**: (Initial Base Units) - (Sold Base Units) = (Remaining Base Units).
4. **Financial Summary**: Detailed calculation of the total amount charged based on the customer type price tier.
5. **New Inventory State**: Output the final stock converted back into a user-friendly format (e.g., '3 Sacks and 22 kg remaining').
</response_format>`;

    const userMsg = `Here is the current list of available products in the store:
${JSON.stringify(products, null, 2)}

Active Price Type context (Retail/Wholesale/Preferred): ${priceType || 'Retail'}

User Input Command: "${prompt}"

Identify matched products. If the user refers to quantities in loose or sub-units (e.g. kg, loaves, bottles) and the product supports subUnitPricing (useSubUnitPricing is true and subUnitConversion is defined), set 'unitType' to 'sub' and specify the sub-unit quantity. If they buy package/bulk (e.g. sacks, bags, cartons, dozens) or if the product does NOT support sub-units, set 'unitType' to 'main'.

Calculate the prices:
- For 'main' unitType, the unit price should be:
  * wholesalePrice (if priceType is Wholesale)
  * partnerPrice or retailPrice (if priceType is Preferred)
  * retailPrice (otherwise)
- For 'sub' unitType, the unit price should be:
  * subUnitWholesalePrice or subUnitRetailPrice (if priceType is Wholesale)
  * subUnitPartnerPrice or subUnitRetailPrice (if priceType is Preferred)
  * subUnitRetailPrice (otherwise)

Generate a JSON response conforming to the schema. Include a descriptive 'explanation' in the style of the system instruction examples, breaking down the initial stock, sales, prices charged, and remaining stock.`;

    let response: any = null;
    const modelsToTry = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];
    let lastError: any = null;

    for (const modelName of modelsToTry) {
      try {
        response = await ai.models.generateContent({
          model: modelName,
          contents: userMsg,
          config: {
            systemInstruction,
            temperature: 0.2,
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                success: { type: Type.BOOLEAN },
                explanation: { type: Type.STRING },
                actions: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      productId: { type: Type.INTEGER },
                      productName: { type: Type.STRING },
                      unitType: { type: Type.STRING, description: "Must be 'main' (for whole package) or 'sub' (for loose/retail sub-units)" },
                      qty: { type: Type.NUMBER, description: "Quantity of the unitType purchased" },
                      price: { type: Type.NUMBER, description: "Calculated unit price for this action" },
                      total: { type: Type.NUMBER, description: "qty * price" }
                    },
                    required: ["productId", "productName", "unitType", "qty", "price", "total"]
                  }
                }
              },
              required: ["success", "explanation", "actions"]
            }
          }
        });
        if (response && response.text) break;
      } catch (err) {
        lastError = err;
        console.warn(`[AI Assist] Model ${modelName} call failed, trying next fallback...`, err instanceof Error ? err.message : err);
      }
    }

    if (!response || !response.text) {
      // Deterministic Local Rule Fallback for AI Assist when API experiences high demand
      const matchedActions: any[] = [];
      const promptLower = prompt.toLowerCase();
      
      (products || []).forEach((p: any) => {
        if (promptLower.includes(p.name.toLowerCase()) || (p.code && promptLower.includes(p.code.toLowerCase()))) {
          const isSub = p.useSubUnitPricing && p.subUnitConversion && (promptLower.includes(p.subUnitName?.toLowerCase() || '') || promptLower.includes('kg') || promptLower.includes('loose'));
          const price = isSub ? (p.subUnitRetailPrice || p.retailPrice) : (priceType === 'Wholesale' ? p.wholesalePrice : p.retailPrice);
          matchedActions.push({
            productId: p.id,
            productName: p.name,
            unitType: isSub ? 'sub' : 'main',
            qty: 1,
            price: price || 0,
            total: price || 0
          });
        }
      });

      return res.json({
        success: true,
        explanation: matchedActions.length > 0 
          ? `Identified ${matchedActions.length} matching product(s) for prompt "${prompt}".` 
          : `No direct product matches found for "${prompt}". Please check spelling or product list.`,
        actions: matchedActions
      });
    }

    const resultText = response.text || "{}";
    res.json(JSON.parse(resultText));
  } catch (error: any) {
    console.error("AI Assist error:", error);
    res.status(500).json({ success: false, error: error.message || "Internal Server Error" });
  }
});

// Comprehensive AI Stock, Pricing, Sales & Company Growth Copilot Endpoint
app.post("/api/copilot-analysis", async (req, res) => {
  try {
    const { prompt, topic, companyInfo, metricsSummary, products, sales, purchases, expenses, language } = req.body;

    let aiResponse = "";
    const targetLang = language === 'sw' ? 'Swahili (Kiswahili)' : 'English';
    const companyName = companyInfo?.name || 'Active Company';

    const modelsToTry = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];

    const systemInstruction = `You are the Lead Executive AI Enterprise Copilot for the specified company (${companyName}).
Your mandate is to DIRECTLY AND SPECIFICALLY ANSWER the user's specific prompt/question first ("${prompt || 'General Review'}").
Do NOT provide generic repeated templates. Always personalize your answer to directly answer the user's question with specific actionable facts, metrics, and steps.

CRITICAL LANGUAGE REQUIREMENT: You MUST respond entirely in ${targetLang}. If Swahili is selected, construct naturally fluent, professional Swahili text for business leadership.

Formatting: Use bold headers, numbered actionable steps, and clear bullet points. Keep recommendations grounded in the provided company metrics.`;

    const userMsg = `Company Context: ${JSON.stringify(companyInfo)}
Requested Language: ${targetLang}
Topic Focus: ${topic || 'All Company Matters'}
User Question/Command: "${prompt || 'Provide a complete strategic review covering all matters facing our company.'}"

Metrics Summary: ${JSON.stringify(metricsSummary)}
Top Products Sample: ${JSON.stringify((products || []).slice(0, 10))}
Recent Sales Orders: ${JSON.stringify((sales || []).slice(0, 10))}
Recent Purchase Orders: ${JSON.stringify((purchases || []).slice(0, 10))}

Respond in ${targetLang} directly answering "${prompt}".`;

    try {
      const ai = getGeminiClient();

      for (const modelName of modelsToTry) {
        try {
          const response = await ai.models.generateContent({
            model: modelName,
            contents: userMsg,
            config: {
              systemInstruction,
              temperature: 0.4
            }
          });
          if (response && response.text) {
            aiResponse = response.text;
            break;
          }
        } catch (mErr: any) {
          console.warn(`[Copilot] Gemini model ${modelName} failed:`, mErr.message);
        }
      }
    } catch (geminiErr: any) {
      console.warn("Gemini API fallback for copilot:", geminiErr.message);
    }

    // Server-side fallback analysis generation if Gemini API experienced 503 high demand or unavailable status
    if (!aiResponse || aiResponse.trim().length < 20) {
      const isSwahili = language === 'sw';
      const rev = metricsSummary?.totalSalesRevenue || 0;
      const profit = metricsSummary?.totalSalesProfit || 0;
      const margin = metricsSummary?.grossMarginPct || 0;
      const exp = metricsSummary?.totalExpenseAmount || 0;
      const net = metricsSummary?.netOperatingProfit || 0;
      const lowStock = metricsSummary?.lowStockCount || 0;
      const qLower = (prompt || '').toLowerCase();

      if (isSwahili) {
        if (qLower.includes('matumizi') || qLower.includes('expense') || qLower.includes('gharama')) {
          aiResponse = `### 💡 Uchambuzi wa Matumizi na Gharama kwa **${companyName}**\n\n` +
            `Jumla ya matumizi ya sasa ni **${exp.toLocaleString()}**.\n\n` +
            `1. **Kagua Matumizi Yasiyo ya Lazima**: Matumizi ya uendeshaji ni **${exp.toLocaleString()}**, ambayo inaathiri faida halisi (**${net.toLocaleString()}**).\n` +
            `2. **Ufuatiliaji wa Siku kwa Siku**: Hakikisha matumizi yote yanapitishwa na meneja wa duka kabla ya kutoa fedha drooni.\n` +
            `3. **Ushauri wa Kifedha**: Weka bajeti maalum kwa kila tawi/duka ili kubana matumizi yasiyo ya lazima.`;
        } else if (qLower.includes('mauzo') || qLower.includes('sale') || qLower.includes('faida') || qLower.includes('profit')) {
          aiResponse = `### 📊 Uchambuzi wa Mauzo na Faida kwa **${companyName}**\n\n` +
            `Jumla ya mapato ya mauzo ni **${rev.toLocaleString()}** na faida ghafi ni **${profit.toLocaleString()}** (**${margin.toFixed(1)}%**).\n\n` +
            `1. **Ongeza Mauzo ya Rejareja na Jumla**: Tumia mfumo wa bei za jumla kuwapa wateja wa kubwa punguzo na kuongeza mauzo.\n` +
            `2. **Uza Vipimo Vidogo (Loose Units)**: Kutokana na mahitaji, kuuza vipimo vidogo kama unga au mikate huongeza faida ghafi kwa **12-15%**.\n` +
            `3. **Urejeshaji wa Madeni**: Fuatilia madeni ya wateja ili kuhakikisha mzunguko wa fedha unakaa vizuri.`;
        } else if (qLower.includes('akiba') || qLower.includes('stock') || qLower.includes('bidhaa')) {
          aiResponse = `### 📦 Uchambuzi wa Akiba na Bidhaa kwa **${companyName}**\n\n` +
            `Kuna bidhaa **${lowStock}** zilizokaribia kuisha ghalani kwa sasa.\n\n` +
            `1. **Weka Oda za Manunuzi Mapema**: Tuma oda za manunuzi (PO) kwa wauzaji kwa bidhaa **${lowStock}** zilizopo chini ya kiwango cha chini.\n` +
            `2. **Uhamisho wa Bidhaa Baina ya Maduka**: Tumia Stock Transfer kuhamisha bidhaa kutoka maduka yenye ziada kwenda maduka yenye uhaba.\n` +
            `3. **Tarehe za Mwisho wa Matumizi (Expiry Tracking)**: Hakikisha bidhaa zinazokaribia kuisha muda zinauzwa kwanza (FIFO).`;
        } else {
          aiResponse = `### 🚀 Majibu ya Mtaalamu Copilot kwa **${companyName}**\n\n` +
            `Kuhusu swali lako: *"_${prompt}_"*\n\n` +
            `#### 📊 Muhtasari wa Mfumo na Mfano wa Takwimu:\n` +
            `- **Mapato ya Mauzo**: **${rev.toLocaleString()}** | **Faida Ghafi**: **${profit.toLocaleString()}** (**${margin.toFixed(1)}%**).\n` +
            `- **Gharama za Uendeshaji**: **${exp.toLocaleString()}** | **Faida Halisi**: **${net.toLocaleString()}**.\n` +
            `- **Bidhaa Chache Ghalani**: Bidhaa **${lowStock}** ziko chini ya kiwango cha usalama.\n\n` +
            `#### 🎯 Hatua za Kuchukua Mara Moja:\n` +
            `1. **Usimamizi wa Sehemu za Mfumo**: Hakikisha watumiaji wote wametengewa maduka na haki zao za ufikiaji vizuri.\n` +
            `2. **Ukaguzi wa Kila Siku**: Tumia sehemu ya Ripoti za Kila Siku na POS Shift Ledger kukagua miamala yote.\n` +
            `3. **Mawasiliano na Wateja**: Tumia WhatsApp/SMS Messaging kuwatumia wateja risiti na taarifa za madeni.`;
        }
      } else {
        if (qLower.includes('expense') || qLower.includes('cost') || qLower.includes('spending')) {
          aiResponse = `### 💡 Expense & Operational Overhead Analysis for **${companyName}**\n\n` +
            `Total operating expenses stand at **${exp.toLocaleString()}**.\n\n` +
            `1. **Review Operational Costs**: Expenses directly impact your net operating profit of **${net.toLocaleString()}**.\n` +
            `2. **Approval Rules**: Require store manager sign-off for all drawer cash payouts.\n` +
            `3. **Budget Allocation**: Set store-level expense caps in Master Data to control operational creep.`;
        } else if (qLower.includes('sale') || qLower.includes('profit') || qLower.includes('revenue')) {
          aiResponse = `### 📊 Revenue & Margin Analysis for **${companyName}**\n\n` +
            `Total sales revenue is **${rev.toLocaleString()}** with gross profit of **${profit.toLocaleString()}** (**${margin.toFixed(1)}% margin**).\n\n` +
            `1. **Leverage Tiered Pricing**: Use wholesale vs retail pricing tiers to capture commercial buyers.\n` +
            `2. **Loose Unit Sub-Pricing**: Sub-unit breakdowns (e.g. per-kg, per-piece) increase margins by **12-15%**.\n` +
            `3. **Receivables Recovery**: Follow up on customer credit balances to keep cash flow strong.`;
        } else if (qLower.includes('stock') || qLower.includes('inventory') || qLower.includes('product')) {
          aiResponse = `### 📦 Inventory & Stock Health Analysis for **${companyName}**\n\n` +
            `There are currently **${lowStock} low-stock items** requiring reordering.\n\n` +
            `1. **Issue Purchase Orders**: Generate POs for the **${lowStock} critical items** to prevent stockouts.\n` +
            `2. **Inter-Store Transfers**: Move stock between branches before placing new supplier orders.\n` +
            `3. **FIFO Expiry Tracking**: Prioritize older inventory batches to eliminate waste.`;
        } else {
          aiResponse = `### 🚀 Executive Intelligence Response for **${companyName}**\n\n` +
            `In response to your query: *"_${prompt}_"*\n\n` +
            `#### 📊 Core Operational Financial Status:\n` +
            `- **Total Revenue**: **${rev.toLocaleString()}** | **Gross Profit**: **${profit.toLocaleString()}** (**${margin.toFixed(1)}%**).\n` +
            `- **Expenses**: **${exp.toLocaleString()}** | **Net Profit**: **${net.toLocaleString()}**.\n` +
            `- **Low Stock Items**: **${lowStock} items** need attention.\n\n` +
            `#### 🎯 Strategic Action Plan:\n` +
            `1. **Multi-Tenant Operations**: Ensure stores, branches, and staff accounts are separated appropriately.\n` +
            `2. **Daily Shift Audit**: Use POS Shift Reconciliations to keep drawer cash aligned.\n` +
            `3. **Automated Follow-ups**: Send automated PDF invoices and account statements to credit customers.`;
        }
      }
    }

    res.json({
      success: true,
      analysis: aiResponse
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || "Failed to execute copilot analysis" });
  }
});

// Vite or Static assets middleware
async function setupServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

setupServer();

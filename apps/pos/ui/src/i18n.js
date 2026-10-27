// Menu and main-button labels in Telugu / Hindi for counter staff (Settings → This device). Reports, settings and
// invoices stay in English: they're read by the owner and the CA, and GST terms are English on the portal too.
// ponytail: a lookup on the English text; anything not listed falls back to English.
export const LANGS = { en: 'English', te: 'తెలుగు (Telugu)', hi: 'हिन्दी (Hindi)' };
export const lang = () => { try { return localStorage.getItem('fs_lang') || 'en'; } catch { return 'en'; } };
export const setLang = (l) => { try { localStorage.setItem('fs_lang', l); } catch { /* private window: stays English */ } };

const W = {
  te: {
    Home: 'హోమ్', Parties: 'పార్టీలు', 'Party Details': 'పార్టీ వివరాలు', 'Loyalty Points': 'లాయల్టీ పాయింట్లు', 'Follow-ups': 'ఫాలో-అప్‌లు', Items: 'వస్తువులు',
    Sale: 'అమ్మకం', 'Sale Invoices': 'అమ్మకపు బిల్లులు', 'Estimate/ Quotation': 'అంచనా / కొటేషన్', 'Proforma Invoice': 'ప్రొఫార్మా బిల్లు', 'Payment-In': 'వచ్చిన డబ్బు',
    'Sale Order': 'అమ్మకపు ఆర్డర్', 'Delivery Challan': 'డెలివరీ చలాన్', 'Sale Return/ Credit Note': 'తిరిగి వచ్చిన సరుకు', 'Quick Billing': 'త్వరిత బిల్లింగ్', 'Day Close': 'రోజు ముగింపు',
    'Purchase & Expense': 'కొనుగోలు & ఖర్చులు', Counter: 'కౌంటర్', 'Bills & documents': 'బిల్లులు & పత్రాలు', Payments: 'చెల్లింపులు', Bills: 'బిల్లులు', Returns: 'రిటర్న్‌లు', Orders: 'ఆర్డర్లు', 'Quotes & delivery': 'కొటేషన్ & డెలివరీ', 'Purchase Bills': 'కొనుగోలు బిల్లులు', 'Payment-Out': 'చెల్లించిన డబ్బు', Expenses: 'ఖర్చులు', 'Purchase Order': 'కొనుగోలు ఆర్డర్',
    'Purchase Return/ Dr. Note': 'కొనుగోలు రిటర్న్', 'Cash & Bank': 'నగదు & బ్యాంక్', 'Bank Accounts': 'బ్యాంక్ ఖాతాలు', 'Cash In Hand': 'చేతిలో నగదు', Cheques: 'చెక్కులు',
    Accounting: 'అకౌంటింగ్', Staff: 'సిబ్బంది', Attendance: 'హాజరు', 'Online Store': 'ఆన్‌లైన్ స్టోర్', Reports: 'రిపోర్టులు', Utilities: 'సాధనాలు', Settings: 'సెట్టింగ్‌లు', Help: 'సహాయం',
    'Open Anything': 'ఏదైనా తెరవండి', '+ Add Sale': '+ అమ్మకం', '+ Add Purchase': '+ కొనుగోలు', Lock: 'లాక్', Shortcuts: 'షార్ట్‌కట్‌లు',
  },
  hi: {
    Home: 'होम', Parties: 'पार्टियाँ', 'Party Details': 'पार्टी विवरण', 'Loyalty Points': 'लॉयल्टी पॉइंट', 'Follow-ups': 'फ़ॉलो-अप', Items: 'सामान',
    Sale: 'बिक्री', 'Sale Invoices': 'बिक्री बिल', 'Estimate/ Quotation': 'अनुमान / कोटेशन', 'Proforma Invoice': 'प्रोफ़ॉर्मा बिल', 'Payment-In': 'आया भुगतान',
    'Sale Order': 'बिक्री ऑर्डर', 'Delivery Challan': 'डिलीवरी चालान', 'Sale Return/ Credit Note': 'बिक्री वापसी', 'Quick Billing': 'क्विक बिलिंग', 'Day Close': 'दिन बंद',
    'Purchase & Expense': 'खरीद और खर्च', Counter: 'काउंटर', 'Bills & documents': 'बिल और दस्तावेज़', Payments: 'भुगतान', Bills: 'बिल', Returns: 'रिटर्न', Orders: 'ऑर्डर', 'Quotes & delivery': 'कोटेशन और डिलीवरी', 'Purchase Bills': 'खरीद बिल', 'Payment-Out': 'दिया भुगतान', Expenses: 'खर्च', 'Purchase Order': 'खरीद ऑर्डर',
    'Purchase Return/ Dr. Note': 'खरीद वापसी', 'Cash & Bank': 'नकद और बैंक', 'Bank Accounts': 'बैंक खाते', 'Cash In Hand': 'हाथ में नकद', Cheques: 'चेक',
    Accounting: 'अकाउंटिंग', Staff: 'स्टाफ़', Attendance: 'हाज़िरी', 'Online Store': 'ऑनलाइन स्टोर', Reports: 'रिपोर्ट', Utilities: 'टूल्स', Settings: 'सेटिंग्स', Help: 'मदद',
    'Open Anything': 'कुछ भी खोलें', '+ Add Sale': '+ बिक्री', '+ Add Purchase': '+ खरीद', Lock: 'लॉक', Shortcuts: 'शॉर्टकट',
  },
};
const cur = lang();
export const t = (s) => W[cur]?.[s] || s;

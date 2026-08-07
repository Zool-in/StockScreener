// ─── Qualitative Analyst Profiles Registry ──────────────────────────────────
// Structured analyst profiles for major high-volume F&O constituents.
// Contains business model, moat, specialty, advantages, disadvantages, and SWOT analysis.

const REGISTRY = {
  'RELIANCE': {
    businessModel: 'Conglomerate operating in energy/petrochemicals (O2C), digital services (Jio), retail (Reliance Retail), and new energy. Vertically integrated model capturing value across retail consumer touchpoints and digital ecosystems.',
    moat: 'Scale and leadership dominance. Near-monopoly in telecom data delivery, largest retail store network in India, and world-class refining complexity at Jamnagar ensuring high-margin refining spreads.',
    specialty: 'High-volume capital execution and cross-sector market disruption.',
    advantages: [
      'Massive cash flows from energy (O2C) funding retail/digital expansions.',
      'Jio\'s 450M+ subscriber base acts as a digital distribution channel.',
      'Strong retail leadership with high pricing power and supplier leverage.'
    ],
    disadvantages: [
      'Highly capital-intensive expansions lead to periodic debt loading.',
      'Vulnerable to global refining margin cycles and crude oil price volatility.',
      'Retail and telecom sectors face intense regulatory scrutiny.'
    ],
    financialGrowth: 'Strong double-digit revenue growth driven by Jio ARPU hikes and Reliance Retail store count expansion. Energy margins remain resilient.',
    futureGrowth: 'Transition to green hydrogen and solar energy (Giga factories in Jamnagar) to drive the next decade of capital appreciation.',
    swot: {
      strengths: ['Unmatched balance sheet strength', 'Digital & retail market leadership', 'Highly complex Jamnagar refinery asset'],
      weaknesses: ['Conglomerate discount potential', 'High dependency on key leadership succession'],
      opportunities: ['5G monetization & Jio AirFiber adoption', 'New energy/hydrogen economy', 'Retail IPO unlocks'],
      threats: ['Regulatory interventions in telecom tariffs', 'Global economic slowdown hitting energy demand']
    }
  },
  'TCS': {
    businessModel: 'Global IT service provider delivering software development, consulting, cloud migrations, and digital transformation solutions via a highly efficient global delivery model.',
    moat: 'High switching costs. Deep client integration with Fortune 500 companies, proprietary software suites (Ignio, BaNCS), and a massive trained workforce ensuring seamless execution.',
    specialty: 'Enterprise application management and large-scale cloud migration projects.',
    advantages: [
      'Industry-leading operating margins (24-26%) and high cash conversion.',
      'Extremely low attrition rates compared to global peers.',
      'Robust corporate governance standards (Tata Group heritage).'
    ],
    disadvantages: [
      'High exposure to US and European corporate tech-budget cycles.',
      'Fierce talent competition and wage inflation impact margins.',
      'Slow execution on aggressive cloud acquisitions compared to peers.'
    ],
    financialGrowth: 'Resilient mid-single-digit constant currency growth with strong order bookings (TCV) in the banking, financial, and insurance (BFSI) sectors.',
    futureGrowth: 'Agenerative AI cloud integrations and IoT enterprise solutions driving next-gen outsourcing deals.',
    swot: {
      strengths: ['Tata heritage & top governance', 'Excellent cash generation & dividend payouts', 'Massive global scale'],
      weaknesses: ['Vulnerability to global IT spending slowdowns', 'Relatively low revenue share from high-end consulting'],
      opportunities: ['Generative AI consulting and integration', 'Expansion into continental Europe and Japan', 'Vendor consolidation deals'],
      threats: ['US visa regulations and restrictions', 'Severe wage hikes in emerging tech roles']
    }
  },
  'HDFCBANK': {
    businessModel: 'Largest private sector bank in India, offering retail banking, corporate banking, treasury operations, and digital financial products.',
    moat: 'Cost of funds advantage (low-cost CASA deposits), massive nationwide branch network, and a premier credit culture keeping bad loans (NPA) to a minimum.',
    specialty: 'Retail credit lending, credit cards, and digital payment processing.',
    advantages: [
      'Post-merger asset base creates unmatched wholesale lending capacity.',
      'Best-in-class risk management with historical Gross NPA below 1.5%.',
      'Strong cross-selling capability across retail banking customers.'
    ],
    disadvantages: [
      'Short-term net interest margin (NIM) pressure due to high-cost liabilities post-merger.',
      'Slower deposit growth compared to aggressive credit demands.',
      'Frequent IT infrastructure outages lead to regulatory warnings.'
    ],
    financialGrowth: 'Steady deposit mobilization alongside stable double-digit credit growth. Earnings driven by retail loan pick-ups.',
    futureGrowth: 'Deeper rural penetration and digital loan originations to expand retail customer reach.',
    swot: {
      strengths: ['Premium retail brand and low-cost CASA', 'Highly disciplined credit underwriting', 'Massive branch footprint'],
      weaknesses: ['NIM compression post-merger with parent HDFC', 'IT upgrade backlog and regulatory drag'],
      opportunities: ['Cross-selling home loans to retail customers', 'Semi-urban and rural credit growth', 'Wealth management expansions'],
      threats: ['Aggressive deposit rate wars among banks', 'Macroeconomic downturns affecting credit quality']
    }
  },
  'INFY': {
    businessModel: 'Global technology services consulting firm helping businesses navigate digital transformations through cloud, AI, and outsourced software engineering.',
    moat: 'Client relationship stickiness and global delivery scale. Deep domain expertise in BFSI, retail, and manufacturing sectors.',
    specialty: 'Digital transformation consulting and engineering services.',
    advantages: [
      'Strong operating cash flow and active share buyback programs.',
      'Robust positioning in high-growth digital and cloud service lines.',
      'High employee training standards through the Mysore campus.'
    ],
    disadvantages: [
      'Vulnerability to macroeconomic cycles in North America (primary market).',
      'Historical leadership changes and board disputes.',
      'High dependence on subcontracting costs during project spikes.'
    ],
    financialGrowth: 'Moderate revenue growth with strong digital deal pipelines. Pressure on operating margins due to talent retention costs.',
    futureGrowth: 'AI-first enterprise frameworks (Topaz) and cloud platforms driving larger outsourcing renewals.',
    swot: {
      strengths: ['Highly recognized digital brand', 'Strong free cash flow generation', 'Broad sector exposure'],
      weaknesses: ['High geographic concentration in the US', 'Periodic volatility in employee attrition'],
      opportunities: ['Generative AI automation services', 'European market expansion', 'Expansion of cybersecurity offerings'],
      threats: ['Protectionist labor laws in major markets', 'Client insourcing of core tech capability']
    }
  },
  'ICICIBANK': {
    businessModel: 'Leading private sector bank offering retail, corporate, and investment banking products with an aggressive technology-first focus (iMobile Pay).',
    moat: 'Technology edge and retail depository base. Strong digital transaction infrastructure attracting high CASA volumes.',
    specialty: 'Digital banking, retail mortgages, and auto loans.',
    advantages: [
      'Excellent digital onboarding systems reducing customer acquisition costs.',
      'High capital adequacy ratio ensuring solid growth buffer.',
      'Diversified loan portfolio reducing concentration risk.'
    ],
    disadvantages: [
      'Vulnerable to corporate exposure defaults during credit contractions.',
      'Fierce competitive pressure from HDFC Bank and public banks in rural areas.',
      'Rapid digital expansion increases cybersecurity risk exposure.'
    ],
    financialGrowth: 'Industry-leading Net Interest Margins (NIM) and high double-digit profit growth driven by strong fee income.',
    futureGrowth: 'Leveraging ecosystem banking (InstaBIZ) to capture SME and corporate supply chain cash flows.',
    swot: {
      strengths: ['Best-in-class mobile banking technology', 'Robust Net Interest Margin structure', 'Strong deposit franchise'],
      weaknesses: ['Historical vulnerability to corporate NPA cycles (now mitigated)', 'Higher cost-to-income ratio compared to peers'],
      opportunities: ['SME lending and supply chain finance', 'Wealth management and insurance cross-selling', 'Rural deposit mobilization'],
      threats: ['Macroeconomic inflation limiting retail loan growth', 'Cyber security attacks and data privacy risks']
    }
  },
  'SBIN': {
    businessModel: 'Largest public sector bank in India, acting as the primary financial intermediary for government disbursements, corporate credit, and mass retail deposit collection.',
    moat: 'Sovereign backing and unparalleled reach. Depository base is highly sticky, supported by rural branches where private banks do not operate.',
    specialty: 'Infrastructure wholesale lending, home loans, and mass banking transactions.',
    advantages: [
      'Lowest cost of deposits due to sovereign trust and massive saving account volume.',
      'YONO app acts as a highly successful digital banking platform.',
      'Substantial valuation unlocks from subsidiaries (SBI Life, SBI Cards, SBI Mutual Fund).'
    ],
    disadvantages: [
      'Higher exposure to government-mandated development schemes and farm loan waivers.',
      'Lower operational efficiency compared to private sector peers.',
      'Relatively high employee cost structure due to public sector union pay scales.'
    ],
    financialGrowth: 'Robust credit growth led by public infrastructure capex. NPAs have declined to historical lows, boosting net profitability.',
    futureGrowth: 'Monetizing digital data on YONO and leading corporate consortium lending for India\'s infra builds.',
    swot: {
      strengths: ['Sovereign backing and mass public trust', 'Unrivaled branch network', 'Strong subsidiary value'],
      weaknesses: ['Operational rigidity of a public system', 'Potential asset quality slippage in agriculture/MSME segments'],
      opportunities: ['Co-lending with NBFCs for rural credit', 'Monetization of YONO platform', 'Corporate capex credit demand'],
      threats: ['Policy directives on credit concessions', 'Talent drain of tech professionals to private players']
    }
  },
  'ITC': {
    businessModel: 'Diversified conglomerate with business interests spanning cigarettes, fast-moving consumer goods (FMCG), hotels, paperboards, packaging, and agri-business.',
    moat: 'Monopoly-like dominance in the Indian cigarette market (75%+ share) creating high-margin cash flows that subsidize other sectors.',
    specialty: 'Cigarette manufacturing and luxury hotel management.',
    advantages: [
      'Cash cow tobacco business provides reliable dividends and expansion capital.',
      'Rapidly scaling FMCG brand footprint (Aashirvaad, Sunfeast, Yippee).',
      'Strong agri-commodity sourcing network.'
    ],
    disadvantages: [
      'High ESG hurdles and regulatory cigarette tax hikes.',
      'FMCG margins are low compared to pure-play FMCG giants.',
      'Capital-intensive hotel division dilutes return on capital metrics.'
    ],
    financialGrowth: 'Steady single-digit volume growth in cigarettes, accompanied by margin expansion in FMCG and hotel business recovery.',
    futureGrowth: 'Demerger of the Hotels business to unlock return ratios, and scaling premium FMCG exports.',
    swot: {
      strengths: ['Tobacco business pricing power', 'Massive distribution reach (7M+ retail outlets)', 'Extremely low leverage'],
      weaknesses: ['Heavy ESG penalties from global funds', 'Conglomerate capital allocation drags'],
      opportunities: ['Demerger of hotels and potential IT spin-off', 'Premiumization of FMCG portfolio', 'Expansion in digital trade channels'],
      threats: ['Sudden cigarette excise duty hikes', 'Alternative/electronic nicotine regulations']
    }
  },
  'TATAMOTORS': {
    businessModel: 'Global automotive manufacturer producing commercial vehicles, passenger cars, and electric vehicles (EVs) in India, alongside Jaguar Land Rover (JLR) globally.',
    moat: 'EV leadership in India (70%+ market share) and JLR\'s luxury brand equity (Range Rover, Defender) driving high global pricing power.',
    specialty: 'Electric vehicle manufacturing and luxury SUV engineering.',
    advantages: [
      'Strong JLR order book and recovery in high-margin luxury sales.',
      'First-mover advantage in Indian EV infrastructure and passenger cars.',
      'Consistent leader in the Indian Commercial Vehicle segment.'
    ],
    disadvantages: [
      'JLR is vulnerable to global economic slowdowns in the US, Europe, and China.',
      'High research and development costs required for transition to EV/Hydrogen.',
      'Cyclical nature of the commercial vehicle industry.'
    ],
    financialGrowth: 'Significant turn-around in profitability driven by JLR debt reduction and domestic PV market share expansion.',
    futureGrowth: 'Splitting passenger and commercial vehicles into separate listed entities to unlock independent valuations.',
    swot: {
      strengths: ['JLR brand prestige and order book', 'EV passenger vehicle monopoly in India', 'Tata Group synergies'],
      weaknesses: ['High dependency on global chip supply chains', 'Historically volatile JLR cash flows'],
      opportunities: ['CV demerger unlocking focused capital', 'Expansion of EV charging network in India', 'Hydrogen fuel cell development'],
      threats: ['Fierce competition in domestic SUV segment', 'High raw material/commodity price spikes']
    }
  }
};

module.exports = { REGISTRY };

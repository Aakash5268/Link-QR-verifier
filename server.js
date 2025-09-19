// Simple Backend API for Website & QR Analyzer
const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const fetch = require('node-fetch');
const { URL } = require('url');

const app = express();
const PORT = 3001;

// Middleware (these help our server work properly)
app.use(cors()); // Allows frontend to talk to backend
app.use(express.json()); // Helps us read JSON data

console.log('🚀 Starting Website Analyzer API...');

// Test endpoint - visit http://localhost:3001/health to check if server works
app.get('/health', (req, res) => {
  console.log('✅ Health check requested');
  res.json({ 
    status: 'Server is running!', 
    time: new Date().toLocaleString() 
  });
});

// Main analysis endpoint - this is where the magic happens
app.post('/analyze', async (req, res) => {
  console.log('📊 Analysis request received');
  
  const { url } = req.body;
  
  if (!url) {
    console.log('❌ No URL provided');
    return res.status(400).json({ error: 'Please provide a URL' });
  }
  
  try {
    console.log(`🔍 Analyzing: ${url}`);
    
    // Clean up the URL (add https if needed)
    let cleanUrl = url.trim();
    if (!cleanUrl.startsWith('http')) {
      cleanUrl = 'https://' + cleanUrl;
      console.log(`🔧 Fixed URL to: ${cleanUrl}`);
    }
    
    // Check if URL is valid
    const urlObj = new URL(cleanUrl);
    const domain = urlObj.hostname;
    console.log(`🌐 Domain: ${domain}`);
    
    // Analyze the website
    const analysis = await analyzeWebsite(cleanUrl, domain);
    
    console.log('✅ Analysis complete!');
    res.json({
      success: true,
      analysis: analysis,
      analyzedUrl: cleanUrl
    });
    
  } catch (error) {
    console.error('❌ Analysis failed:', error.message);
    res.status(500).json({
      error: 'Could not analyze website',
      message: error.message
    });
  }
});

// QR content analysis (for non-URL QR codes)
app.post('/analyze-qr', async (req, res) => {
  console.log('📱 QR analysis request received');
  
  const { content } = req.body;
  
  if (!content) {
    return res.status(400).json({ error: 'Please provide content' });
  }
  
  console.log(`🔍 QR Content: ${content.substring(0, 50)}...`);
  
  // Analyze what type of content this is
  let contentType = 'Plain Text';
  let description = `This QR code contains: "${content}". `;
  
  if (content.includes('@') && content.includes('.')) {
    contentType = 'Email Address';
    description += 'This appears to be an email address for direct contact.';
  } else if (content.match(/^\+?\d[\d\s\-\(\)]+$/)) {
    contentType = 'Phone Number';
    description += 'This is a phone number for calling or messaging.';
  } else if (content.includes('WIFI:')) {
    contentType = 'WiFi Credentials';
    description += 'This contains WiFi network information for automatic connection.';
  } else if (content.includes('BEGIN:VCARD')) {
    contentType = 'Contact Information';
    description += 'This is contact information that can be saved to your address book.';
  } else {
    description += `This appears to be plain text content. ${content.length > 100 ? 'The content is quite lengthy.' : 'This is a simple text-based QR code.'}`;
  }
  
  console.log(`📋 Content Type: ${contentType}`);
  
  res.json({
    success: true,
    analysis: {
      title: `QR Code: ${contentType}`,
      description: description,
      type: `QR Content - ${contentType}`,
      safety: 'safe',
      warnings: []
    }
  });
});

// Function to analyze websites
async function analyzeWebsite(url, domain) {
  console.log('🕷️ Starting web scraping...');
  
  try {
    // Method 1: Try simple fetch first (faster)
    console.log('📡 Trying simple fetch...');
    const response = await fetch(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    const html = await response.text();
    const $ = cheerio.load(html);
    
    // Extract information from the webpage
    const title = $('title').text() || domain;
    const description = $('meta[name="description"]').attr('content') || 
                      $('meta[property="og:description"]').attr('content') || '';
    
    console.log(`📄 Found title: ${title}`);
    console.log(`📝 Found description: ${description.substring(0, 100)}...`);
    
    // Get main content
    const headings = [];
    $('h1, h2, h3').each((i, el) => {
      if (i < 5) headings.push($(el).text().trim());
    });
    
    const bodyText = $('body').text().substring(0, 1000);
    const linkCount = $('a[href]').length;
    const imageCount = $('img[src]').length;
    
    console.log(`🔗 Found ${linkCount} links, ${imageCount} images`);
    
    // Determine website type
    const websiteType = determineWebsiteType(title, description, bodyText, domain);
    console.log(`🏷️ Website type: ${websiteType}`);
    
    // Check safety
    const safetyInfo = checkSafety(url, domain);
    console.log(`🛡️ Safety: ${safetyInfo.safety}`);
    
    // Generate detailed description
    const detailedDescription = generateDescription(title, description, headings, bodyText, websiteType, domain);
    
    return {
      title: `${title} - Website Analysis`,
      description: detailedDescription,
      type: websiteType,
      safety: safetyInfo.safety,
      warnings: safetyInfo.warnings,
      metadata: {
        domain: domain,
        status: response.status,
        hasSSL: url.startsWith('https://'),
        pageElements: {
          links: linkCount,
          images: imageCount,
          headings: headings.length
        }
      }
    };
    
  } catch (error) {
    console.error('❌ Web scraping failed:', error.message);
    
    // Fallback: Basic analysis without scraping
    return {
      title: `${domain} - Basic Analysis`,
      description: `This website (${domain}) could not be fully analyzed due to access restrictions or technical issues. Based on the domain name, this appears to be a standard website. The domain uses ${url.startsWith('https://') ? 'secure HTTPS' : 'HTTP'} protocol. Without being able to access the content, we cannot provide detailed information about the website's purpose or content. Please visit the site directly to see what it contains, but exercise caution if you're unsure about its legitimacy.`,
      type: 'Unknown Website',
      safety: 'warning',
      warnings: ['Could not access website content for analysis', 'Please verify website legitimacy before visiting'],
      metadata: {
        domain: domain,
        status: 'Unknown',
        hasSSL: url.startsWith('https://')
      }
    };
  }
}

// Function to determine what type of website this is
function determineWebsiteType(title, description, content, domain) {
  const text = (title + ' ' + description + ' ' + content).toLowerCase();
  
  if (domain.includes('edu') || text.includes('university') || text.includes('school')) {
    return 'Educational';
  } else if (domain.includes('gov') || text.includes('government')) {
    return 'Government';
  } else if (text.includes('shop') || text.includes('buy') || text.includes('cart')) {
    return 'E-commerce';
  } else if (text.includes('news') || text.includes('article') || text.includes('blog')) {
    return 'News/Blog';
  } else if (text.includes('search') || domain.includes('google')) {
    return 'Search Engine';
  } else if (text.includes('social') || text.includes('profile') || domain.includes('facebook') || domain.includes('twitter')) {
    return 'Social Media';
  } else {
    return 'General Website';
  }
}

// Function to check if website seems safe
function checkSafety(url, domain) {
  const warnings = [];
  let safety = 'safe';
  
  // Check for HTTPS
  if (!url.startsWith('https://')) {
    warnings.push('Website does not use secure HTTPS connection');
    safety = 'warning';
  }
  
  // Check for suspicious patterns
  const suspicious = ['bit.ly', 'tinyurl', 'suspicious', 'malicious', 'phishing'];
  for (const pattern of suspicious) {
    if (domain.includes(pattern)) {
      warnings.push('Domain may contain suspicious elements');
      safety = 'warning';
      break;
    }
  }
  
  // Check for IP addresses instead of domains
  if (/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(domain)) {
    warnings.push('Website uses IP address instead of domain name');
    safety = 'warning';
  }
  
  return { safety, warnings };
}

// Function to generate detailed description
function generateDescription(title, description, headings, bodyText, websiteType, domain) {
  let result = '';
  
  // Start with title and description
  if (title && title !== domain) {
    result += `${title} - `;
  }
  
  if (description) {
    result += `${description} `;
  }
  
  // Add information about headings/sections
  if (headings && headings.length > 0) {
    const topHeadings = headings.slice(0, 3).join(', ');
    result += `The main sections include: ${topHeadings}. `;
  }
  
  // Add content preview
  if (bodyText) {
    const cleanText = bodyText.replace(/\s+/g, ' ').trim();
    const preview = cleanText.substring(0, 200);
    if (preview.length > 50) {
      result += `Content preview: "${preview}${cleanText.length > 200 ? '...' : ''}". `;
    }
  }
  
  // Add website type explanation
  const typeExplanations = {
    'Educational': 'This educational website provides learning resources and academic information.',
    'Government': 'This government website provides official information and services.',
    'E-commerce': 'This is an online shopping website where you can purchase products.',
    'News/Blog': 'This website provides news articles and blog content.',
    'Search Engine': 'This is a search engine that helps you find information online.',
    'Social Media': 'This is a social media platform for connecting and sharing.',
    'General Website': 'This appears to be a standard website providing information and services.'
  };
  
  result += typeExplanations[websiteType] || typeExplanations['General Website'];
  
  // Ensure minimum length
  if (result.length < 100) {
    result += ` The website domain is ${domain}, which suggests it serves its intended audience with relevant content and functionality.`;
  }
  
  return result;
}

// Start the server
app.listen(PORT, () => {
  console.log('');
  console.log('🎉 SUCCESS! Server is running!');
  console.log(`📡 API URL: http://localhost:${PORT}`);
  console.log(`🔍 Test it: http://localhost:${PORT}/health`);
  console.log('');
  console.log('✅ Ready to analyze websites!');
});

// Handle server shutdown gracefully
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down server...');
  process.exit(0);
});
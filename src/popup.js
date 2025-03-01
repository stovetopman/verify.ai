/*
const OpenAI = require("openai").OpenAI

const openai = new OpenAI({
  apiKey: "",
});
*/
import { CLAIMBUSTER_KEY } from './config.js';



async function checkClaim() {
  let api_key = CLAIMBUSTER_KEY;
  let input_claim = 'The sky is blue.';

  // Setup the Fetch GET Request with the appropriate headers and URL
  let response = await fetch(`https://idir.uta.edu/claimbuster/api/v2/score/text/${input_claim}`, {
      method: 'GET',
      headers: {
        'x-api-key': api_key,
      }
  });

  // Wait for the JSON response and then log it
  const data = await response.json();
  console.log(JSON.stringify(data, null, 2));
}

//EXTRACT ARTICLE CONTENT
// Function to extract article content
function extractArticleContent() {
  try {
    console.log('Starting content extraction in page context');
    
    // First, check if we're in the right context
    if (!document || !document.body) {
      console.error('No document or body found');
      return null;
    }

    // Get all the text content first
    const allText = document.body.innerText;
    console.log('Total text length:', allText.length);

    // Try to get the main content area
    let mainContent = document.querySelector('main, article, [role="main"], .article-content, #article-content');
    console.log('Found main content:', !!mainContent);

    if (!mainContent) {
      console.log('No main content found, using body');
      mainContent = document.body;
    }

    // Clone the content so we don't modify the actual page
    const contentClone = mainContent.cloneNode(true);

    // Remove unwanted elements
    const unwantedSelectors = [
      // Media elements
      'img',
      'video',
      'iframe',
      'audio',
      'picture',
      'svg',
      
      // Interactive elements
      'button',
      '[role="button"]',
      'input[type="button"]',
      'input[type="submit"]',
      
      // Media controls
      '.video-controls',
      '.audio-controls',
      '.player-controls',
      '.media-controls',
      '[role="slider"]',
      '.volume-control',
      '.playback-control',
      
      // Icons
      'i[class*="icon"]',
      'span[class*="icon"]',
      'div[class*="icon"]',
      '.fa',                    // Font Awesome
      '.material-icons',        // Material Icons
      '[class*="icon-"]',
      '[class*="-icon"]',
      
      // Ads and social
      '.ad',
      '.advertisement',
      '.social-share',
      '.video-player',
      '.share-buttons',
      '.social-media',
      
      // Additional controls
      '.controls',
      '.control-bar',
      '.player',
      '[aria-controls]',
      
      // Recommendation sections
      '[class*="recommend"]',
      '[class*="related"]',
      '[class*="popular"]',
      '[class*="trending"]',
      '[class*="suggested"]',
      '[class*="for-you"]',
      '[class*="more-to-read"]',
      '[class*="you-may-like"]',
      '[id*="recommend"]',
      '[id*="related"]',
      '[id*="popular"]',
      '[id*="trending"]',
      '[id*="suggested"]',
      '[id*="sidebar"]',
      '.sidebar',
      '.recommendations',
      '.related-articles',
      '.more-stories',
      '.read-more',
      '.also-read',
      '.outbrain',
      '.taboola',
      '[data-module="related"]',
      '[data-module="recommended"]',
      
      // Social media and publisher promotions
      '[class*="follow-us"]',
      '[class*="follow-on"]',
      '[class*="social-links"]',
      '[class*="social-list"]',
      '[class*="social-nav"]',
      '[class*="newsletter"]',
      '[class*="subscribe"]',
      '[class*="subscription"]',
      '.social-links',
      '.social-buttons',
      '.follow-buttons',
      '.follow-links',
      '.social-footer',
      '.social-header',
      '.publisher-tools',
      '.publisher-social',
      '.publication-links',
      '.network-links',
      '.channel-links',
      '.platform-links',
      '.stay-connected',
      '.connect-with-us',
      '.follow-section',
      '.social-promotion',
      '.social-embed',
      '.twitter-embed',
      '.x-embed',
      '.facebook-embed',
      '.instagram-embed',
      '.tiktok-embed',
      '[data-social-embed]',
      '[data-network-links]',
      '[data-platform="social"]',
      // Common social media CTAs
      '[class*="sign-up"]',
      '[class*="join-us"]',
      '[class*="follow-our"]',
      '[class*="connect-with"]',
      // Newsletter and subscription prompts
      '[class*="newsletter-signup"]',
      '[class*="email-signup"]',
      '[class*="subscription-offer"]',
      '[class*="subscribe-now"]',
      '[class*="get-updates"]',
      '.newsletter-container',
      '.subscription-box',
      '.email-capture',
      '.signup-prompt',
      '.subscription-prompt',
      '.membership-prompt'
    ];

    unwantedSelectors.forEach(selector => {
      const elements = contentClone.querySelectorAll(selector);
      console.log(`Removing ${elements.length} ${selector} elements`);
      elements.forEach(el => el.remove());
    });

    // Get the article title
    const title = document.querySelector('h1')?.textContent || document.title;
    console.log('Found title:', title);

    // Get the cleaned article content
    const content = contentClone.innerHTML;
    console.log('Content length:', content.length);

    // Try to get the byline
    const byline = document.querySelector('.byline, .author, [rel="author"]')?.textContent || '';
    console.log('Found byline:', byline);

    return {
      title: title,
      content: content,
      excerpt: allText.substring(0, 200),
      byline: byline,
      dir: document.dir || null,
      siteName: document.querySelector('meta[property="og:site_name"]')?.content || window.location.hostname
    };
  } catch (error) {
    console.error('Error in content extraction:', error);
    return null;
  }
}

//GET WEBPAGE CONTENT
// Wait for DOM to be loaded before setting up event listeners
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM Content Loaded');
  
  const extractButton = document.getElementById('extract-btn');
  console.log('Extract button found:', !!extractButton);
  
  if (!extractButton) {
    console.error('Extract button not found in DOM');
    return;
  }

  extractButton.addEventListener('click', async () => {
    try {
      console.log('Extract button clicked');
      
      const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
      console.log('Current tab:', {
        id: tab.id,
        url: tab.url
      });

      checkClaim();
      
      const results = await chrome.scripting.executeScript({
        target: {tabId: tab.id},
        function: extractArticleContent,
        // Add this to ensure we have access to the page's DOM
        world: "MAIN"
      });
      console.log('Script execution results:', results);

      const articleData = results[0].result;
      console.log('Extracted article data:', {
        hasData: !!articleData,
        title: articleData?.title,
        contentLength: articleData?.content?.length
      });
      
      const contentDiv = document.getElementById('article-content');
      
      if (articleData) {
        console.log('Rendering article content');
        contentDiv.innerHTML = `
          <h2>${articleData.title || ''}</h2>
          ${articleData.byline ? `<p><em>${articleData.byline}</em></p>` : ''}
          ${articleData.content || 'No content found'}
        `;
      } else {
        console.log('No article data to render');
        contentDiv.textContent = 'Could not extract article content';
      }
    } catch (error) {
      console.error('Error in click handler:', error);
      document.getElementById('article-content').textContent = 'Error extracting article content';
    }
  });
});

// Add fact checking functionality
async function checkFactClaim(claim) {
  try {
    const response = await fetch(`https://factchecktools.googleapis.com/v1alpha1/claims:search?query=${encodeURIComponent(claim)}`, {
      headers: {
        'key': GOOGLE_API_KEY
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log('Fact check results:', data);
    return data;
  } catch (error) {
    console.error('Error checking facts:', error);
    return null;
  }
}

// Add event listener for fact check button
document.getElementById('fact-check-btn').addEventListener('click', async () => {
  const claim = document.getElementById('claim-input').value.trim();
  if (!claim) {
    alert('Please enter a claim to check');
    return;
  }

  const contentDiv = document.getElementById('article-content');
  contentDiv.textContent = 'Checking claim...';

  const results = await checkFactClaim(claim);
  if (results && results.claims && results.claims.length > 0) {
    contentDiv.innerHTML = results.claims.map(claim => `
      <div class="fact-check-result">
        <h4>${claim.text}</h4>
        <p>Rating: ${claim.claimReview[0]?.textualRating || 'No rating'}</p>
        <p>${claim.claimReview[0]?.title || ''}</p>
        <a href="${claim.claimReview[0]?.url || '#'}" target="_blank">Read more</a>
      </div>
    `).join('<hr>');
  } else {
    contentDiv.textContent = 'No fact check results found for this claim';
  }
});

  // Function to get a summary from OpenAI API
  async function getSummaryFromOpenAI(text) {
    
    //const prompt = `Summarize the following content:\n\n${text}`;
  
    try {

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ',
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo', 
          "messages": [
            {
                "role": "developer",
                "content": "format each claim in the article into 1 sentance with numbers"
            },
            {
                "role": "user",
                "content": text
            }
        ],
        max_completion_tokens: 150,
        }),
      });

      console.log("this is the response:" + response);

        /*
      const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: "Hello, how are you?" }],
      });
  
      console.log(response.choices[0].message.content);
      */

      const data = await response.json();
      console.log(data);
      return data;
    } catch (error) {
      console.error('Error summarizing with OpenAI:', error);
      return 'Error summarizing content';
    }

  }



  // Button trigger to output
document.addEventListener('DOMContentLoaded', function () {
    const summarizeButton = document.getElementById('summarize-btn');
  
    // Check if the button exists
    if (summarizeButton) {
      summarizeButton.addEventListener('click', async () => {
        try {
          console.log('Summarizing content...');
          const articleContent = await extractArticleContent();
          console.log(articleContent);
          const summarizeContent = await getSummaryFromOpenAI(articleContent.content);

          console.log(summarizeContent);
          let summaryText = summarizeContent.choices[0].message.content;
          
          // Output the summarized content
          const resultDiv = document.getElementById('result-content');
          resultDiv.textContent = summaryText ? summaryText : "Error summarizing content";
          
        } catch (error) {
          console.error('Error during summarization:', error);
        }
      });
    }
  });
  

  
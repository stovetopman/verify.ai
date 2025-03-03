import { OPENAI_KEY, CLAIMBUSTER_KEY } from "./config.js";

async function checkClaim(articleContent) {
  try {
    if (!articleContent) {
      throw new Error('No article content found');
    }

    // Setup the request
    const response = await fetch(`https://idir.uta.edu/claimbuster/api/v2/score/text/sentences/${articleContent}`, {
      method: 'GET',
      headers: {
        'x-api-key': CLAIMBUSTER_KEY,
      }
    });

    if (!response.ok) {
      throw new Error(`ClaimBuster API error: ${response.status}`);
    }

    const data = await response.json();
    console.log('ClaimBuster response:', data);
    console.log(data.results[0].text);
    return data;

  } catch (error) {
    console.error('Error in checkClaim:', error);
    throw error;
  }
}

// Function to extract article content
function extractArticleContent() {
  try {
    console.log('Starting content extraction in page context');
    
    if (!document || !document.body) {
      console.error('No document or body found');
      return null;
    }

    // Try to find the main article content using common selectors
    const articleSelectors = [
      'article',
      '[role="article"]',
      '.article-body',
      '.article-content',
      '.story-body',
      '.story-content',
      '.post-content',
      '.entry-content',
      '.main-content',
      'main',
      '#article-body',
      '#story-body',
      '.article__body',
      '.article-text',
      '.story-text'
    ];

    let mainContent = null;
    for (const selector of articleSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        mainContent = element;
        console.log(`Found main content using selector: ${selector}`);
        break;
      }
    }

    if (!mainContent) {
      console.log('No specific article container found, attempting fallback methods');
      // Fallback: Look for the largest text container
      const paragraphs = Array.from(document.getElementsByTagName('p'));
      if (paragraphs.length > 0) {
        // Find the paragraph's common ancestor with the most paragraphs
        const ancestors = new Map();
        paragraphs.forEach(p => {
          let ancestor = p.parentElement;
          while (ancestor && ancestor !== document.body) {
            ancestors.set(ancestor, (ancestors.get(ancestor) || 0) + 1);
            ancestor = ancestor.parentElement;
          }
        });
        
        // Get the ancestor with the most paragraphs
        mainContent = Array.from(ancestors.entries())
          .reduce((a, b) => a[1] > b[1] ? a : b)[0];
      }
    }

    if (!mainContent) {
      console.error('Could not find article content');
      return null;
    }

    // Clone the content
    const contentClone = mainContent.cloneNode(true);

    // Remove all script and style elements
    const elementsToRemove = contentClone.querySelectorAll('script, style, noscript, iframe, img, video, audio, picture, svg, canvas, form, input, button, [role="button"], [role="complementary"], [role="banner"], [role="navigation"], .ad, .advertisement, .social-share, .newsletter, .related-articles, .recommended, .comments, .sidebar, aside, nav, footer, header');
    elementsToRemove.forEach(el => el.remove());

    // Clean up text content
    const paragraphs = Array.from(contentClone.getElementsByTagName('p'))
      .filter(p => {
        const text = p.textContent.trim();
        // Filter out short or likely non-article paragraphs
        if (text.length < 20) return false;
        // Filter out common non-article text patterns
        const nonArticlePatterns = [
          /^share$/i,
          /^subscribe$/i,
          /^follow us$/i,
          /^read more$/i,
          /^comments$/i,
          /^\d+ (min|minute) read$/i,
          /^published/i,
          /^updated/i
        ];
        return !nonArticlePatterns.some(pattern => pattern.test(text));
    });

    // Get the article title
    const titleSelectors = [
      'h1',
      '.article-title',
      '.entry-title',
      '.post-title',
      '[itemprop="headline"]'
    ];
    
    let title = null;
    for (const selector of titleSelectors) {
      const titleElement = document.querySelector(selector);
      if (titleElement) {
        title = titleElement.textContent.trim();
        break;
      }
    }
    
    if (!title) {
      title = document.title.split('|')[0].trim();
    }

    // Combine paragraphs into clean content
    const cleanContent = paragraphs
      .map(p => p.textContent.trim())
      .filter(text => text.length > 0)
      .join('\n\n');

    return {
      title: title,
      content: cleanContent,
      excerpt: cleanContent.substring(0, 200),
      byline: document.querySelector('.byline, .author, [rel="author"]')?.textContent?.trim() || '',
      siteName: document.querySelector('meta[property="og:site_name"]')?.content || window.location.hostname
    };

  } catch (error) {
    console.error('Error in content extraction:', error);
    return null;
  }
}

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

  // Function to get a summary from OpenAI API
  async function getSummaryFromOpenAI(text) {
    //const prompt = `Summarize the following content:\n\n${text}`;
    const prompt = `
    Given a news article, get the five most relevant claims in the article and format each of them
    into exactly one sentence in the same paragraph. Do not enumerate each claim.

    ---

    The following is an example output:

    Apples are red. Apples are declicious. There are different types of apples. Apples are a fruit.
    Apples are good for you.
    `
  
    try {

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini', 
          "messages": [
            {
                "role": "developer",
                "content": prompt
            },
            {
                "role": "user",
                "content": text
            }
        ],
        max_completion_tokens: 160,
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


  document.addEventListener('DOMContentLoaded', function () {
    const startFlowButton = document.getElementById('main-btn');
    console.log('Main start button found:', !!startFlowButton);
    
    if (!startFlowButton) {
      console.error('START button not found in DOM');
      return;
    }
  
    startFlowButton.addEventListener('click', async () => {
      try {
        console.log('Extract button clicked');
        
        const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
        console.log('Current tab:', {
          id: tab.id,
          url: tab.url
        });
        
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
 

        console.log('Summarizing content...');
        console.log(articleData.content);
        const summarizeContent = await getSummaryFromOpenAI(articleData.content);

        console.log(summarizeContent);
        let summaryText = summarizeContent.choices[0].message.content;
        console.log("HERE HERER HEREREHERE", summaryText);
        
        //DATA OBJECT THAT IS RETURNED FROM FACT CHECKING API, ADD LOGIC AFTER THIS LINE
        const data = checkClaim(summaryText);
        ///
        const score = averageRoundedScore(data);
        const metric = metricSystem(score);


        console.log(metric);
        console.log(score);

        const finalOutput = document.getElementById('final-output');

        // Get fact check results
        const claimBusterResult = await checkClaim(summaryText);
        
        // Sort claims by their score and convert to percentage
        const sortedClaims = claimBusterResult.results
          .sort((a, b) => b.score - a.score)
          .map((claim, index) => ({
            ...claim,
            formattedScore: Math.round(claim.score * 100) + '%'
          }));

        // Create the results display
        const resultsHTML = `
          <div style="margin-top: 20px; padding: 15px; border-radius: 8px; background-color: ${metric.color}15;">
            <div style="display: flex; align-items: center; margin-bottom: 15px;">
              <div style="width: 24px; height: 24px; border-radius: 50%; background-color: ${metric.color}; margin-right: 12px;"></div>
              <h4 style="margin: 0; font-size: 1.2rem;">${metric.text}</h4>
            </div>

            <div style="background-color: white; padding: 12px; border-radius: 6px; border: 1px solid ${metric.color}40; margin-bottom: 15px;">
              <div style="font-size: 1.1rem; font-weight: 500; margin-bottom: 5px;">Overall Score: ${score}/5</div>
              <div style="font-size: 0.9rem; color: #666;">Based on analysis of ${claimBusterResult.results.length} claims</div>
            </div>

            <div style="background-color: white; padding: 12px; border-radius: 6px; border: 1px solid ${metric.color}40; margin-bottom: 15px;">
              <div style="font-weight: 500; margin-bottom: 10px;">Analyzed Claims:</div>
              <div style="max-height: 200px; overflow-y: auto;">
                ${sortedClaims.map((claim, index) => `
                  <div style="padding: 8px; margin-bottom: 8px; background-color: #f8f9fa; border-radius: 4px; border-left: 3px solid ${getScoreColor(claim.score)};">
                    <div style="font-size: 0.9rem; margin-bottom: 4px;">${index + 1}. ${claim.text}</div>
                    <div style="font-size: 0.8rem; color: #666; display: flex; align-items: center;">
                      <span style="width: 8px; height: 8px; border-radius: 50%; background-color: ${getScoreColor(claim.score)}; margin-right: 6px;"></span>
                      Score: ${claim.formattedScore}
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>

            <div style="background-color: white; padding: 12px; border-radius: 6px; border: 1px solid ${metric.color}40;">
              <div style="font-weight: 500; margin-bottom: 10px;">Article Summary:</div>
              <div style="font-size: 0.9rem; line-height: 1.5; max-height: 150px; overflow-y: auto;">
                ${summaryText}
              </div>
            </div>
          </div>
        `;
        
        finalOutput.innerHTML = resultsHTML;

      } catch (error) {
        console.error('Error:', error);
      }

      
    
    });

  })
  
  async function averageRoundedScore(resultObject) {
    try {
      if (!resultObject || !resultObject.results || resultObject.results.length === 0) {
        throw new Error('Invalid result object');
      }

      const total = resultObject.results.reduce((sum, result) => sum + result.score, 0);
      const average = total / resultObject.results.length;
      
      // Convert to 1-5 scale
      if (average <= 0.2) return 1;
      if (average <= 0.4) return 2;
      if (average <= 0.6) return 3;
      if (average <= 0.8) return 4;
      return 5;
    } catch (error) {
      console.error('Error calculating score:', error);
      return null;
    }
  }

  function metricSystem(value) {
    const metrics = {
      1: { text: "Not Credible", color: "#FF4444" },
      2: { text: "Not Very Credible", color: "#FFA500" },
      3: { text: "Somewhat Credible", color: "#FFD700" },
      4: { text: "Probably Credible", color: "#90EE90" },
      5: { text: "Credible", color: "#4CAF50" }
    };
    
    return metrics[value] || { text: "Unable to determine credibility", color: "#808080" };
  }

  async function performFactCheck() {
    try {
      const resultDiv = document.getElementById('result-content');
      const finalOutput = document.getElementById('final-output');
      
      if (!resultDiv || !resultDiv.textContent) {
        throw new Error('No content to fact check');
      }

      // Show loading state
      finalOutput.innerHTML = '<div class="loading">Checking facts...</div>';

      // Get the claims from the summary
      const summaryText = resultDiv.textContent;
      
      // Check claims using ClaimBuster
      const claimBusterResult = await checkClaim(summaryText);
      
      // Calculate the credibility score
      const score = await averageRoundedScore(claimBusterResult);
      const metric = metricSystem(score);

      // Sort claims by their score and convert to percentage
      const sortedClaims = claimBusterResult.results
        .sort((a, b) => b.score - a.score)
        .map((claim, index) => ({
          ...claim,
          formattedScore: Math.round(claim.score * 100) + '%'
        }));
      
      // Create the results display
      const resultsHTML = `
        <div style="margin-top: 20px; padding: 15px; border-radius: 8px; background-color: ${metric.color}15;">
          <div style="display: flex; align-items: center; margin-bottom: 15px;">
            <div style="
              width: 24px;
              height: 24px;
              border-radius: 50%;
              background-color: ${metric.color};
              margin-right: 12px;">
            </div>
            <h4 style="margin: 0; font-size: 1.2rem;">${metric.text}</h4>
          </div>

          <div style="
            background-color: white;
            padding: 12px;
            border-radius: 6px;
            border: 1px solid ${metric.color}40;
            margin-bottom: 15px;">
            <div style="font-size: 1.1rem; font-weight: 500; margin-bottom: 5px;">
              Overall Score: ${score}/5
            </div>
            <div style="font-size: 0.9rem; color: #666;">
              Based on analysis of ${claimBusterResult.results.length} claims
            </div>
          </div>

          <div style="
            background-color: white;
            padding: 12px;
            border-radius: 6px;
            border: 1px solid ${metric.color}40;">
            <div style="font-weight: 500; margin-bottom: 10px;">Analyzed Claims:</div>
            <div style="max-height: 200px; overflow-y: auto;">
              ${sortedClaims.map((claim, index) => `
                <div style="
                  padding: 8px;
                  margin-bottom: 8px;
                  background-color: #f8f9fa;
                  border-radius: 4px;
                  border-left: 3px solid ${getScoreColor(claim.score)};
                ">
                  <div style="font-size: 0.9rem; margin-bottom: 4px;">
                    ${index + 1}. ${claim.text}
                  </div>
                  <div style="
                    font-size: 0.8rem;
                    color: #666;
                    display: flex;
                    align-items: center;
                  ">
                    <span style="
                      width: 8px;
                      height: 8px;
                      border-radius: 50%;
                      background-color: ${getScoreColor(claim.score)};
                      margin-right: 6px;
                    "></span>
                    Score: ${claim.formattedScore}
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      `;
      
      finalOutput.innerHTML = resultsHTML;
      
    } catch (error) {
      console.error('Error in fact checking:', error);
      finalOutput.innerHTML = `
        <div style="color: #FF4444; padding: 10px;">
          Error performing fact check: ${error.message}
        </div>
      `;
    }
  }

  // Helper function to get color based on individual claim score
  function getScoreColor(score) {
    if (score >= 0.8) return "#4CAF50";  // High credibility
    if (score >= 0.6) return "#90EE90";  // Probably credible
    if (score >= 0.4) return "#FFD700";  // Somewhat credible
    if (score >= 0.2) return "#FFA500";  // Not very credible
    return "#FF4444";                    // Not credible
  }

  // Add event listener for the fact check button
  document.addEventListener('DOMContentLoaded', function() {
    const factCheckButton = document.createElement('button');
    factCheckButton.id = 'fact-check-btn';
    factCheckButton.textContent = 'Fact Check';
    
    // Add the button to the button group
    const buttonGroup = document.querySelector('.button-group');
    if (buttonGroup) {
      buttonGroup.appendChild(factCheckButton);
    }
    
    // Add click handler
    factCheckButton.addEventListener('click', performFactCheck);
  });

// Remove the old button event listeners and create new ones
document.addEventListener('DOMContentLoaded', function() {
  const buttonGroup = document.querySelector('.button-group');
  if (!buttonGroup) return;

  // Clear existing buttons
  buttonGroup.innerHTML = '';

  // Create the analyze button
  const analyzeButton = document.createElement('button');
  analyzeButton.id = 'analyze-btn';
  analyzeButton.textContent = 'Fact Check + Summary';
  analyzeButton.className = 'primary-button';
  buttonGroup.appendChild(analyzeButton);

  analyzeButton.addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
      
      // Show loading text with progress bar
      const finalOutput = document.getElementById('final-output');
      finalOutput.innerHTML = `
        <div style="text-align: center; margin-top: 15px;">
          <div style="color: #666; margin-bottom: 10px;">Analyzing article...</div>
          <div class="progress-bar">
            <div class="progress-bar-fill"></div>
          </div>
        </div>
      `;

      // Extract content and perform analysis
      const results = await chrome.scripting.executeScript({
        target: {tabId: tab.id},
        function: extractArticleContent,
        world: "MAIN"
      });

      const articleData = results[0].result;
      if (!articleData) {
        throw new Error('Could not extract article content');
      }

      const summarizeContent = await getSummaryFromOpenAI(articleData.content);
      const summaryText = summarizeContent.choices[0].message.content;
      const claimBusterResult = await checkClaim(summaryText);
      const score = await averageRoundedScore(claimBusterResult);
      const metric = metricSystem(score);
      const sortedClaims = claimBusterResult.results
        .sort((a, b) => b.score - a.score)
        .map(claim => ({
          ...claim,
          formattedScore: Math.round(claim.score * 100) + '%'
        }));

      // Create and inject the floating panel
      await chrome.scripting.executeScript({
        target: {tabId: tab.id},
        func: (metric, score, sortedClaims, summaryText) => {
          // Remove any existing panel
          const existingPanel = document.getElementById('verify-ai-results-panel');
          if (existingPanel) existingPanel.remove();

          // Helper function for getting score colors
          function getScoreColor(score) {
            if (score >= 0.8) return "#4CAF50";  // High credibility
            if (score >= 0.6) return "#90EE90";  // Probably credible
            if (score >= 0.4) return "#FFD700";  // Somewhat credible
            if (score >= 0.2) return "#FFA500";  // Not very credible
            return "#FF4444";                    // Not credible
          }

          // Create the panel
          const panel = document.createElement('div');
          panel.id = 'verify-ai-results-panel';
          panel.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            width: 400px;
            max-height: 90vh;
            background: white;
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
            z-index: 999999;
            overflow-y: auto;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            animation: slideInPanel 0.3s ease-out;
          `;

          // Update the content sections to handle scrolling better
          panel.innerHTML = `
            <div style="padding: 15px; background-color: ${metric.color}15;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <div style="display: flex; align-items: center;">
                  <div style="width: 24px; height: 24px; border-radius: 50%; background-color: ${metric.color}; margin-right: 12px;"></div>
                  <h4 style="margin: 0; font-size: 1.2rem;">${metric.text}</h4>
                </div>
                <button id="verify-ai-close-button" style="
                  background: none;
                  border: none;
                  cursor: pointer;
                  padding: 5px;
                  font-size: 18px;
                  color: #666;
                ">×</button>
              </div>

              <div style="background-color: white; padding: 12px; border-radius: 6px; border: 1px solid ${metric.color}40; margin-bottom: 15px;">
                <div style="font-size: 1.1rem; font-weight: 500; margin-bottom: 5px;">Overall Score: ${score}/5</div>
                <div style="font-size: 0.9rem; color: #666;">Based on analysis of ${sortedClaims.length} claims</div>
              </div>

              <div style="background-color: white; padding: 12px; border-radius: 6px; border: 1px solid ${metric.color}40; margin-bottom: 15px;">
                <div style="font-weight: 500; margin-bottom: 10px;">Analyzed Claims:</div>
                <div style="max-height: 300px; overflow-y: auto;">
                  ${sortedClaims.map((claim, index) => `
                    <div style="padding: 8px; margin-bottom: 8px; background-color: #f8f9fa; border-radius: 4px; border-left: 3px solid ${getScoreColor(claim.score)};">
                      <div style="font-size: 0.9rem; margin-bottom: 4px;">${index + 1}. ${claim.text}</div>
                      <div style="font-size: 0.8rem; color: #666; display: flex; align-items: center;">
                        <span style="width: 8px; height: 8px; border-radius: 50%; background-color: ${getScoreColor(claim.score)}; margin-right: 6px;"></span>
                        Score: ${claim.formattedScore}
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>

              <div style="background-color: white; padding: 12px; border-radius: 6px; border: 1px solid ${metric.color}40;">
                <div style="font-weight: 500; margin-bottom: 10px;">Article Summary:</div>
                <div style="font-size: 0.9rem; line-height: 1.5;">
                  ${summaryText}
                </div>
              </div>
            </div>
          `;

          // Add styles for better scrolling
          const style = document.createElement('style');
          style.textContent = `
            @keyframes slideInPanel {
              from { transform: translateX(100%); opacity: 0; }
              to { transform: translateX(0); opacity: 1; }
            }
            #verify-ai-results-panel::-webkit-scrollbar {
              width: 8px;
            }
            #verify-ai-results-panel::-webkit-scrollbar-track {
              background: #f1f1f1;
              border-radius: 4px;
            }
            #verify-ai-results-panel::-webkit-scrollbar-thumb {
              background: #888;
              border-radius: 4px;
            }
            #verify-ai-results-panel::-webkit-scrollbar-thumb:hover {
              background: #666;
            }
          `;
          document.head.appendChild(style);

          // Add close button functionality
          panel.querySelector('#verify-ai-close-button').addEventListener('click', () => {
            panel.remove();
          });

          document.body.appendChild(panel);
        },
        args: [metric, score, sortedClaims, summaryText]
      });

      // Close the popup window immediately
      window.close();
          
        } catch (error) {
      console.error('Error in analysis:', error);
      document.getElementById('final-output').innerHTML = `
        <div style="text-align: center; color: #FF4444;">
          Error analyzing article
        </div>
      `;
      // Close popup immediately even if there's an error
      window.close();
    }
  });
});

// Add this function near the top with other utility functions
function cleanWebpage() {
  // Elements to remove (common selectors for ads and unnecessary content)
  const selectorsToRemove = [
    // Ads
    '[class*="ad-"]', '[class*="ads-"]', '[id*="ad-"]', '[id*="ads-"]',
    '[class*="advertisement"]', '[id*="advertisement"]',
    'ins.adsbygoogle', '.ad-container', '.ad-wrapper',
    // Social media
    '.social-share', '.share-buttons', '.social-media',
    // Popups and overlays
    '.popup', '.modal', '.overlay', '[class*="popup"]', '[id*="popup"]',
    '[class*="modal"]', '[id*="modal"]', '.newsletter-signup',
    // Sidebars and non-essential sections
    '.sidebar', 'aside', '.related-articles', '.recommended',
    '.trending', '.popular-posts', '.widget-area',
    // Comments
    '#comments', '.comments-section', '.disqus_thread',
    // Fixed elements
    '.sticky-header', '.fixed-header', '.floating-header',
    '.sticky-footer', '.fixed-footer', '.floating-footer',
    // Newsletter and subscription
    '.newsletter', '.subscribe', '.subscription',
    // Cookie notices and banners
    '.cookie-notice', '.cookie-banner', '.gdpr',
    // Other distractions
    '.outbrain', '.taboola', '[class*="sponsored"]', '[id*="sponsored"]',
    '.promoted', '.partner-content', '.paid-content'
  ];

  // CSS to inject for better reading experience
  const readabilityStyles = `
    body {
      overflow: auto !important;
      position: static !important;
    }
    article, .article, .post, .content-area, .main-content {
      width: 100% !important;
      max-width: 800px !important;
      margin: 0 auto !important;
      padding: 20px !important;
      float: none !important;
    }
    p, li {
      font-size: 18px !important;
      line-height: 1.6 !important;
      margin-bottom: 1.2em !important;
      color: #333 !important;
    }
    h1, h2, h3, h4, h5, h6 {
      margin-top: 1.5em !important;
      margin-bottom: 0.8em !important;
      line-height: 1.3 !important;
    }
  `;

  // Remove distracting elements
  selectorsToRemove.forEach(selector => {
    document.querySelectorAll(selector).forEach(element => {
      element.remove();
    });
  });

  // Remove inline styles that might interfere with reading
  document.querySelectorAll('[style]').forEach(element => {
    if (element.tagName.toLowerCase() !== 'mark') { // Don't remove styles from our highlights
      element.removeAttribute('style');
    }
  });

  // Remove hidden overflow from body and html
  document.body.style.overflow = 'auto';
  document.documentElement.style.overflow = 'auto';

  // Add readability styles
  const style = document.createElement('style');
  style.textContent = readabilityStyles;
  document.head.appendChild(style);

  // Remove fixed positioning
  document.querySelectorAll('*').forEach(element => {
    const position = window.getComputedStyle(element).position;
    if (position === 'fixed' || position === 'sticky') {
      element.style.position = 'static';
    }
  });

  // Force black text on white background for main content
  const mainContent = document.querySelector('article, .article, .post, .content-area, .main-content');
  if (mainContent) {
    mainContent.style.backgroundColor = '#ffffff';
    mainContent.style.color = '#333333';
  }

  return true;
}

// Add this function near the top with other utility functions
function createFloatingPanel(metric, score, sortedClaims, summaryText) {
  const panel = document.createElement('div');
  panel.id = 'verify-ai-results-panel';
  panel.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    width: 400px;
    max-height: 90vh;
    background: white;
    border-radius: 12px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
    z-index: 999999;
    overflow-y: auto;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    animation: slideInPanel 0.3s ease-out;
  `;

  // Add styles for the animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideInPanel {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    #verify-ai-results-panel::-webkit-scrollbar {
      width: 8px;
    }
    #verify-ai-results-panel::-webkit-scrollbar-track {
      background: #f1f1f1;
      border-radius: 4px;
    }
    #verify-ai-results-panel::-webkit-scrollbar-thumb {
      background: #888;
      border-radius: 4px;
    }
    #verify-ai-results-panel::-webkit-scrollbar-thumb:hover {
      background: #666;
    }
  `;
  document.head.appendChild(style);

  panel.innerHTML = `
    <div style="padding: 15px; background-color: ${metric.color}15;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
        <div style="display: flex; align-items: center;">
          <div style="width: 24px; height: 24px; border-radius: 50%; background-color: ${metric.color}; margin-right: 12px;"></div>
          <h4 style="margin: 0; font-size: 1.2rem;">${metric.text}</h4>
        </div>
        <button id="verify-ai-close-button" style="
          background: none;
          border: none;
          cursor: pointer;
          padding: 5px;
          font-size: 18px;
          color: #666;
        ">×</button>
      </div>

      <div style="background-color: white; padding: 12px; border-radius: 6px; border: 1px solid ${metric.color}40; margin-bottom: 15px;">
        <div style="font-size: 1.1rem; font-weight: 500; margin-bottom: 5px;">Overall Score: ${score}/5</div>
        <div style="font-size: 0.9rem; color: #666;">Based on analysis of ${sortedClaims.length} claims</div>
      </div>

      <div style="background-color: white; padding: 12px; border-radius: 6px; border: 1px solid ${metric.color}40; margin-bottom: 15px;">
        <div style="font-weight: 500; margin-bottom: 10px;">Analyzed Claims:</div>
        <div style="max-height: 300px; overflow-y: auto;">
          ${sortedClaims.map((claim, index) => `
            <div style="padding: 8px; margin-bottom: 8px; background-color: #f8f9fa; border-radius: 4px; border-left: 3px solid ${getScoreColor(claim.score)};">
              <div style="font-size: 0.9rem; margin-bottom: 4px;">${index + 1}. ${claim.text}</div>
              <div style="font-size: 0.8rem; color: #666; display: flex; align-items: center;">
                <span style="width: 8px; height: 8px; border-radius: 50%; background-color: ${getScoreColor(claim.score)}; margin-right: 6px;"></span>
                Score: ${claim.formattedScore}
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <div style="background-color: white; padding: 12px; border-radius: 6px; border: 1px solid ${metric.color}40;">
        <div style="font-weight: 500; margin-bottom: 10px;">Article Summary:</div>
        <div style="font-size: 0.9rem; line-height: 1.5;">
          ${summaryText}
        </div>
      </div>
    </div>
  `;

  // Add close button functionality
  panel.querySelector('#verify-ai-close-button').addEventListener('click', () => {
    panel.remove();
  });

  return panel;
}

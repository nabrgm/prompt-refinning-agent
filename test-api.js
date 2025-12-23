// Quick test script for the Polaris API
const API_URL = "https://polaris.invoca.net/api/v1/prediction/9c6fc0fa-f634-4d05-b7ee-33636e68a97f";

async function testChat() {
    console.log("Testing Polaris API...\n");
    
    // First message
    console.log("1. Sending first message...");
    const res1 = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: "Hi, I'm interested in business internet for my restaurant" })
    });
    const data1 = await res1.json();
    console.log("Agent:", data1.text);
    console.log("ChatId:", data1.chatId);
    console.log("");

    // Second message with chatId
    console.log("2. Sending follow-up with chatId...");
    const res2 = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            question: "My name is John Smith and I need service at 123 Main St",
            chatId: data1.chatId 
        })
    });
    const data2 = await res2.json();
    console.log("Agent:", data2.text);
    console.log("");

    // Third message
    console.log("3. Sending third message...");
    const res3 = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            question: "What speeds do you offer and what's the pricing?",
            chatId: data1.chatId 
        })
    });
    const data3 = await res3.json();
    console.log("Agent:", data3.text);
}

testChat().catch(console.error);

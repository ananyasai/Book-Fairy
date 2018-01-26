# BOOK FAIRY
This is a sample project I am working on from my elementary school technology competition

## Setup Instructions
Install Node.js (https://nodejs.org/en/)
npm install -g firebase-tools
firebase login

### Steps
1. Deploy functions: 
   firebase deploy --only functions
2. Deploy Hosting
   In the root of the repo
   firebase deploy --only hosting

### set and unset keys
firebase functions:config:set someservice.key="THE API KEY" someservice.id="THE CLIENT ID"
firebase functions:config:unset
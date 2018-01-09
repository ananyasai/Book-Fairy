'use strict';
  // Imports the Google Cloud client library
const Storage = require('@google-cloud/storage');
const functions = require('firebase-functions'); // Cloud Functions for Firebase library
const DialogflowApp = require('actions-on-google').DialogflowApp; // Google Assistant helper library
const cors = require('cors')({origin: true});
const gcs = require('@google-cloud/storage')();
const spawn = require('child-process-promise').spawn;
const path = require('path');
const os = require('os');
const fs = require('fs');

//Mail configurations
const nodemailer = require('nodemailer');
const gmailEmail = encodeURIComponent(functions.config().gmail.email);
const gmailPassword = encodeURIComponent(functions.config().gmail.password);

//file upload
const formidable = require('formidable');

const bucket = gcs.bucket('book-fairy.appspot.com');
const tempFilePath = path.join(os.tmpdir(), 'file.txt');
const metadata = { contentType: 'text' };

const REGISTER_LINK = 'https://book-fairy.firebaseapp.com/register.html?ref=';
const REGISTER_OUT_TEXT = "Please Register"

const CONFIGURE_LINK = 'https://book-fairy.firebaseapp.com/configBook.html?ref=';
const CONFIGURE_OUT_TEXT = "Configure"

const ADMIN_LINK = 'https://book-fairy.firebaseapp.com/Admin.html?ref=';
const ADMIN_OUT_TEXT = "Administer"

const NO_INPUTS = [
  'I didn\'t hear that.',
  'If you\'re still there, say that again.',
  'We can stop here. See you soon.'
];
var story = '';
var stories = [];

var admin = require("firebase-admin");

admin.initializeApp(functions.config().firebase);
var db = admin.database();

var ref = db.ref("/story-list");

var myStories = [];

var getRandom = function(min, max) {
  return Math.random() * (max - min) + min;
};



exports.dialogflowFirebaseFulfillment = functions.https.onRequest((request, response) => {
  console.log('Dialogflow Request headers: ' + JSON.stringify(request.headers));
  console.log('Dialogflow Request body: ' + JSON.stringify(request.body));
  
  //get encryption key
  var key = functions.config().my.token;
  const app = new DialogflowApp({request: request, response: response});

  var id = app.getUser().userId;
  console.log('calling user: '+id);

  checkIfUserExists(id, request, response);
});

function checkIfUserExists(userId, request, response) {
  //Get a reference to the User store
  var refUsers = db.ref("/Users");
  //Get the value for the specific userId
  refUsers.child(userId).once('value', function(snapshot) {
    //Find out if the user Exists
    var exists = (snapshot.val() !== null);
    var isEnabled = false;
    //Check is user Exists
    if (exists) {
      console.log(snapshot.val());
      console.log(snapshot.val().profile.enabled);
      //Check is the user is enabled
      isEnabled = snapshot.val().profile.enabled;
    } else {
      //Check if autoRegistration is enabled
      if (functions.config().auto.registration) {
        var usersRef = admin.database().ref('/Users');
        console.log('automatically Creating user');

        usersRef.child(userId).set({profile: {id: userId, fname: 'req.body.fname', lname: 'req.body.lname', email: 'req.body.email', enabled: true}})
        .catch(function (err) {
            console.log('updatefailed', err)
        });  
        isEnabled = true;      
      }
    }
    userExistsCallback(userId, exists, isEnabled, request, response);
  });
}

function userExistsCallback(userId, exists, enabled, request, response) {
  if (exists) {
    console.log('user ' + userId + ' exists!');
    if (enabled){
      if (request.body.result) {
        processV1Request(request, response);
      } else if (request.body.queryResult) {
        processV2Request(request, response);
      } else {
        console.log('Invalid Request');
        return response.status(400).end('Invalid Webhook Request (expecting v1 or v2 webhook request)');
      } 
    } else {
      const assistant = new DialogflowApp({request: request, response: response});
      //console.log('Encrypted value: ' + encryptedStr);   
      
      if (assistant.hasSurfaceCapability(assistant.SurfaceCapabilities.SCREEN_OUTPUT)) {
          assistant.tell(assistant.buildRichResponse()
          .addSimpleResponse(`Your  account is not enabled. Please try again later`), NO_INPUTS);
      } else {
          assistant.tell(`<speak>Your  account is not enabled. Please try again later</speak>`, NO_INPUTS);
      }         
    }
   
  } else {
    console.log('user ' + userId + ' does not exist!');
    var password = functions.config().my.token;
    
    var encryptedStr = encrypt(userId, password);
    const assistant = new DialogflowApp({request: request, response: response});
    //console.log('Encrypted value: ' + encryptedStr);   
     
    if (assistant.hasSurfaceCapability(assistant.SurfaceCapabilities.SCREEN_OUTPUT)) {
        assistant.tell(assistant.buildRichResponse()
        .addSimpleResponse(`You are not currently registered. Please click the link below to register`)
        .addBasicCard(assistant.buildBasicCard('register')
        .addButton(REGISTER_OUT_TEXT, REGISTER_LINK+encryptedStr)), NO_INPUTS);
    } else {
        assistant.tell(`<speak>Please follow the link to register</speak> ${REGISTER_LINK}${id}`, NO_INPUTS);
    }   
  }
}

/*
* Function to handle v1 webhook requests from Dialogflow
*/
function processV1Request (request, response) {
  
  let action = request.body.result.action; // https://dialogflow.com/docs/actions-and-parameters
  let parameters = request.body.result.parameters; // https://dialogflow.com/docs/actions-and-parameters
  let inputContexts = request.body.result.contexts; // https://dialogflow.com/docs/contexts
  let requestSource = (request.body.originalRequest) ? request.body.originalRequest.source : undefined;
  const googleAssistantRequest = 'google'; // Constant to identify Google Assistant requests
  const app = new DialogflowApp({request: request, response: response});
  // Create handlers for Dialogflow actions as well as a 'default' handler
  const actionHandlers = {
    // The default welcome intent has been matched, welcome the user (https://dialogflow.com/docs/events#default_welcome_intent)
    'input.welcome': () => {
      // Use the Actions on Google lib to respond to Google requests; for other requests use JSON
      if (requestSource === googleAssistantRequest) {
        sendGoogleResponse('Hello, Welcome to my Dialogflow agent!'); // Send simple response to user
      } else {
        sendResponse('Hello, Welcome to my Dialogflow agent!'); // Send simple response to user
      }
    },
    'input.config': () => {
      // Use the Actions on Google lib to respond to Google requests; for other requests use JSON
      var userId = app.getUser().userId;

      var password = functions.config().my.token;
    
      var encryptedStr = encrypt(userId, password);
      
      //console.log('Encrypted value: ' + encryptedStr);   
     
      if (app.hasSurfaceCapability(app.SurfaceCapabilities.SCREEN_OUTPUT)) {
          app.tell(app.buildRichResponse()
          .addSimpleResponse(`Please follow the link to configure your book`)
          .addBasicCard(app.buildBasicCard('Configure')
          .addButton(CONFIGURE_OUT_TEXT, CONFIGURE_LINK+encryptedStr)), NO_INPUTS);
      } else {
          app.tell(`<speak>Please follow the link to configure your book</speak> ${CONFIG_LINK}${id}`, NO_INPUTS);
      }   

    },
    'input.admin': () => {
      // Use the Actions on Google lib to respond to Google requests; for other requests use JSON
      var userId = app.getUser().userId;

      var password = functions.config().my.token;
    
      var encryptedStr = encrypt(userId, password);
      
      var refUsers = db.ref("/Users");
      //Get the value for the specific userId
      refUsers.child(userId).once('value', function(snapshot) {
        console.log(snapshot.val());
        if(!snapshot.val().profile.admin){
          res.status(200).send('You are not authorized to add story');
          return null        
        }
      });
      
      //console.log('Encrypted value: ' + encryptedStr);   
     
      if (app.hasSurfaceCapability(app.SurfaceCapabilities.SCREEN_OUTPUT)) {
          app.tell(app.buildRichResponse()
          .addSimpleResponse(`Please follow the link to configure your book`)
          .addBasicCard(app.buildBasicCard('Configure')
          .addButton(ADMIN_OUT_TEXT, ADMIN_LINK+encryptedStr)), NO_INPUTS);
      } else {
          app.tell(`<speak>Please follow the link to configure your book</speak> ${ADMIN_LINK}${id}`, NO_INPUTS);
      }   

    },
    'input.yes': () => {
      var userId = app.getUser().userId;
      var refUserBooks = db.ref('/UsersBooks/' + userId +'/book')
      // Check if the session already has some stories
      //if (app.data.stories == null) {
      //Get the the stories from db
      refUserBooks.orderByChild("Read").equalTo(false).once('value').then(function(snapshot) {
        var exists = (snapshot.val() !== null);
        if (!exists){
          story = 'You have heard all my stories. To listen to same stories say of type config';
          if (requestSource === googleAssistantRequest) {
            sendGoogleResponse(story); // Send simple response to user
          } else {
            sendResponse(story);
          }          
        } else {
          var myStories = snapshot.val();
          console.log('my stories: '+myStories);
          var storyData = Object.keys(myStories).map(e => myStories[e])
          var storyNames = storyData.map(a => a.id);
          app.data.stories = storyNames;
          stories = app.data.stories;
          var index = Math.round(getRandom(0, stories.length - 1));
          console.log(storyData[index]);
          console.log(storyData[index].Description);
          story = 'Here is a story for you. ' + storyData[index].Description + ' Would you like to listen to another story? You may say Yes or No.';
          console.log(story);
          stories.splice(index, 1);
          app.data.stories = stories;   
          console.log('stories left: ' + stories.length); 
          storyData[index].Read = true;
          var userBookRef = admin.database().ref('/UsersBooks/'+userId+'/book/'+storyData[index].id);
          userBookRef.set(storyData[index]);
          
          if (requestSource === googleAssistantRequest) {
            sendGoogleResponse(story); // Send simple response to user
          } else {
            sendResponse(story);
          } 
        }
      });     
    },    
    // The default fallback intent has been matched, try to recover (https://dialogflow.com/docs/intents#fallback_intents)
    'input.unknown': () => {
      // Use the Actions on Google lib to respond to Google requests; for other requests use JSON
      if (requestSource === googleAssistantRequest) {
        sendGoogleResponse('I\'m having trouble, can you try that again?'); // Send simple response to user
      } else {
        sendResponse('I\'m having trouble, can you try that again?'); // Send simple response to user
      }
    },
    // Default handler for unknown or undefined actions
    'default': () => {
      // Use the Actions on Google lib to respond to Google requests; for other requests use JSON
      if (requestSource === googleAssistantRequest) {
        let responseToUser = {
          //googleRichResponse: googleRichResponse, // Optional, uncomment to enable
          //googleOutputContexts: ['weather', 2, { ['city']: 'rome' }], // Optional, uncomment to enable
          speech: 'This message is from Dialogflow\'s Cloud Functions for Firebase editor!', // spoken response
          text: 'This is from Dialogflow\'s Cloud Functions for Firebase editor! :-)' // displayed response
        };
        sendGoogleResponse(responseToUser);
      } else {
        let responseToUser = {
          //data: richResponsesV1, // Optional, uncomment to enable
          //outputContexts: [{'name': 'weather', 'lifespan': 2, 'parameters': {'city': 'Rome'}}], // Optional, uncomment to enable
          speech: 'This message is from Dialogflow\'s Cloud Functions for Firebase editor!', // spoken response
          text: 'This is from Dialogflow\'s Cloud Functions for Firebase editor! :-)' // displayed response
        };
        sendResponse(responseToUser);
      }
    }
  };
  // If undefined or unknown action use the default handler
  if (!actionHandlers[action]) {
    action = 'default';
  }
  // Run the proper handler function to handle the request from Dialogflow
  actionHandlers[action]();
  // This function will allow selections of a random story, download the content and format it
  function storyFromatter (stories) {
    console.log('stories available: ' + stories.length);

    if (stories.length <= 0) {
      story = 'You have heard all my stories. Comeback tomorrow!';
      if (requestSource === googleAssistantRequest) {
        sendGoogleResponse(story); // Send simple response to user
      } else {
        sendResponse(story);
      }
    } else {
      var index = Math.round(getRandom(0, stories.length - 1));
      console.log('story index: ' + index);
      console.log('story name: ' + stories[index]);
      bucket.file(stories[index]+'.txt').download({
        destination: tempFilePath
      }).then(() => {
        console.log('File downloaded locally to', tempFilePath);         
        story = 'Here is a story for you. ' + fs.readFileSync(tempFilePath) + ' Would you like to listen to another story? You may say Yes or No.';
        stories.splice(index, 1);
        app.data.stories = stories;   
        console.log('stories left: ' + stories.length); 
        if (requestSource === googleAssistantRequest) {
          sendGoogleResponse(story); // Send simple response to user
        } else {
          sendResponse(story);
        }     
      });
    }
  }
    // Function to send correctly formatted Google Assistant responses to Dialogflow which are then sent to the user
  function sendGoogleResponse (responseToUser) {
    if (typeof responseToUser === 'string') {
      app.ask(responseToUser); // Google Assistant response
    } else {
      // If speech or displayText is defined use it to respond
      let googleResponse = app.buildRichResponse().addSimpleResponse({
        speech: responseToUser.speech || responseToUser.displayText,
        displayText: responseToUser.displayText || responseToUser.speech
      });
      // Optional: Overwrite previous response with rich response
      if (responseToUser.googleRichResponse) {
        googleResponse = responseToUser.googleRichResponse;
      }
      // Optional: add contexts (https://dialogflow.com/docs/contexts)
      if (responseToUser.googleOutputContexts) {
        app.setContext(...responseToUser.googleOutputContexts);
      }
      console.log('Response to Dialogflow (AoG): ' + JSON.stringify(googleResponse));
      app.ask(googleResponse); // Send response to Dialogflow and Google Assistant
    }
  }
  // Function to send correctly formatted responses to Dialogflow which are then sent to the user
  function sendResponse (responseToUser) {
    // if the response is a string send it as a response to the user
    if (typeof responseToUser === 'string') {
      let responseJson = {};
      responseJson.speech = responseToUser; // spoken response
      responseJson.displayText = responseToUser; // displayed response
      response.json(responseJson); // Send response to Dialogflow
    } else {
      // If the response to the user includes rich responses or contexts send them to Dialogflow
      let responseJson = {};
      // If speech or displayText is defined, use it to respond (if one isn't defined use the other's value)
      responseJson.speech = responseToUser.speech || responseToUser.displayText;
      responseJson.displayText = responseToUser.displayText || responseToUser.speech;
      // Optional: add rich messages for integrations (https://dialogflow.com/docs/rich-messages)
      responseJson.data = responseToUser.data;
      // Optional: add contexts (https://dialogflow.com/docs/contexts)
      responseJson.contextOut = responseToUser.outputContexts;
      console.log('Response to Dialogflow: ' + JSON.stringify(responseJson));
      response.json(responseJson); // Send response to Dialogflow
    }
  }
}
// Construct rich response for Google Assistant (v1 requests only)
const app = new DialogflowApp();
const googleRichResponse = app.buildRichResponse()
  .addSimpleResponse('This is the first simple response for Google Assistant')
  .addSuggestions(
    ['Suggestion Chip', 'Another Suggestion Chip'])
    // Create a basic card and add it to the rich response
  .addBasicCard(app.buildBasicCard(`This is a basic card.  Text in a
 basic card can include "quotes" and most other unicode characters
 including emoji 📱.  Basic cards also support some markdown
 formatting like *emphasis* or _italics_, **strong** or __bold__,
 and ***bold itallic*** or ___strong emphasis___ as well as other things
 like line  \nbreaks`) // Note the two spaces before '\n' required for a
                        // line break to be rendered in the card
    .setSubtitle('This is a subtitle')
    .setTitle('Title: this is a title')
    .addButton('This is a button', 'https://assistant.google.com/')
    .setImage('https://developers.google.com/actions/images/badges/XPM_BADGING_GoogleAssistant_VER.png',
      'Image alternate text'))
  .addSimpleResponse({ speech: 'This is another simple response',
    displayText: 'This is the another simple response 💁' });
// Rich responses for Slack and Facebook for v1 webhook requests
const richResponsesV1 = {
  'slack': {
    'text': 'This is a text response for Slack.',
    'attachments': [
      {
        'title': 'Title: this is a title',
        'title_link': 'https://assistant.google.com/',
        'text': 'This is an attachment.  Text in attachments can include \'quotes\' and most other unicode characters including emoji 📱.  Attachments also upport line\nbreaks.',
        'image_url': 'https://developers.google.com/actions/images/badges/XPM_BADGING_GoogleAssistant_VER.png',
        'fallback': 'This is a fallback.'
      }
    ]
  },
  'facebook': {
    'attachment': {
      'type': 'template',
      'payload': {
        'template_type': 'generic',
        'elements': [
          {
            'title': 'Title: this is a title',
            'image_url': 'https://developers.google.com/actions/images/badges/XPM_BADGING_GoogleAssistant_VER.png',
            'subtitle': 'This is a subtitle',
            'default_action': {
              'type': 'web_url',
              'url': 'https://assistant.google.com/'
            },
            'buttons': [
              {
                'type': 'web_url',
                'url': 'https://assistant.google.com/',
                'title': 'This is a button'
              }
            ]
          }
        ]
      }
    }
  }
};
/*
* Function to handle v2 webhook requests from Dialogflow
*/
function processV2Request (request, response) {
  // An action is a string used to identify what needs to be done in fulfillment
  let action = (request.body.queryResult.action) ? request.body.queryResult.action : 'default';
  // Parameters are any entites that Dialogflow has extracted from the request.
  let parameters = request.body.queryResult.parameters || {}; // https://dialogflow.com/docs/actions-and-parameters
  // Contexts are objects used to track and store conversation state
  let inputContexts = request.body.queryResult.contexts; // https://dialogflow.com/docs/contexts
  // Get the request source (Google Assistant, Slack, API, etc)
  let requestSource = (request.body.originalDetectIntentRequest) ? request.body.originalDetectIntentRequest.source : undefined;
  // Get the session ID to differentiate calls from different users
  let session = (request.body.session) ? request.body.session : undefined;
  // Create handlers for Dialogflow actions as well as a 'default' handler
  

  const actionHandlers = {
    // The default welcome intent has been matched, welcome the user (https://dialogflow.com/docs/events#default_welcome_intent)
    'input.welcome': () => {
      sendResponse('Hello, Welcome to my Dialogflow agent!'); // Send simple response to user
    },
    'input.yes': () => {
      // Use the Actions on Google lib to respond to Google requests; for other requests use JSON
        //let story = getRandomFact(stories);
        const stories = [
  'A slave named Androcles once escaped from his master and fled to the forest. As he was wandering about there he came upon a Lion lying down moaning and groaning. At first he turned to flee, but finding that the Lion did not pursue him, he turned back and went up to him. As he came near, the Lion put out his paw, which was all swollen and bleeding, and Androcles found that a huge thorn had got into it, and was causing all the pain. He pulled out the thorn and bound up the paw of the Lion, who was soon able to rise and lick the hand of Androcles like a dog. Then the Lion took Androcles to his cave, and every day used to bring him meat from which to live. But shortly afterwards both Androcles and the Lion were captured, and the slave was sentenced to be thrown to the Lion, after the latter had been kept without food for several days. The Emperor and all his Court came to see the spectacle, and Androcles was led out into the middle of the arena. Soon the Lion was let loose from his den, and rushed bounding and roaring towards his victim. But as soon as he came near to Androcles he recognised his friend, and fawned upon him, and licked his hands like a friendly dog. The Emperor, surprised at this, summoned Androcles to him, who told him the whole story. Whereupon the slave was pardoned and freed, and the Lion let loose to his native forest.',
  'Long ago, the mice had a general council to consider what measures they could take to outwit their common enemy, the Cat. Some said this, and some said that; but at last a young mouse got up and said he had a proposal to make, which he thought would meet the case. "You will all agree," said he, "that our chief danger consists in the sly and treacherous manner in which the enemy approaches us. Now, if we could receive some signal of her approach, we could easily escape from her. I venture, therefore, to propose that a small bell be procured, and attached by a ribbon round the neck of the Cat. By this means we should always know when she was about, and could easily retire while she was in the neighbourhood." This proposal met with general applause, until an old mouse got up and said: "That is all very well, but who is to bell the Cat?" The mice looked at one another and nobody spoke. Then the old mouse said: "It is easy to propose impossible remedies."'
  ];
        sendResponse(stories[1]); // Send simple response to user
     
    }, 
    // The default fallback intent has been matched, try to recover (https://dialogflow.com/docs/intents#fallback_intents)
    'input.unknown': () => {
      // Use the Actions on Google lib to respond to Google requests; for other requests use JSON
      sendResponse('I\'m having trouble, can you try that again?'); // Send simple response to user
    },
    // Default handler for unknown or undefined actions
    'default': () => {
      let responseToUser = {
        //fulfillmentMessages: richResponsesV2, // Optional, uncomment to enable
        //outputContexts: [{ 'name': `${session}/contexts/weather`, 'lifespanCount': 2, 'parameters': {'city': 'Rome'} }], // Optional, uncomment to enable
        fulfillmentText: 'This is from Dialogflow\'s Cloud Functions for Firebase editor! :-)' // displayed response
      };
      sendResponse(responseToUser);
    }
  };
  // If undefined or unknown action use the default handler
  if (!actionHandlers[action]) {
    action = 'default';
  }
  // Run the proper handler function to handle the request from Dialogflow
  actionHandlers[action]();
  // Function to send correctly formatted responses to Dialogflow which are then sent to the user
  function sendResponse (responseToUser) {
    // if the response is a string send it as a response to the user
    if (typeof responseToUser === 'string') {
      let responseJson = {fulfillmentText: responseToUser}; // displayed response
      response.json(responseJson); // Send response to Dialogflow
    } else {
      // If the response to the user includes rich responses or contexts send them to Dialogflow
      let responseJson = {};
      // Define the text response
      responseJson.fulfillmentText = responseToUser.fulfillmentText;
      // Optional: add rich messages for integrations (https://dialogflow.com/docs/rich-messages)
      if (responseToUser.fulfillmentMessages) {
        responseJson.fulfillmentMessages = responseToUser.fulfillmentMessages;
      }
      // Optional: add contexts (https://dialogflow.com/docs/contexts)
      if (responseToUser.outputContexts) {
        responseJson.outputContexts = responseToUser.outputContexts;
      }
      // Send the response to Dialogflow
      console.log('Response to Dialogflow: ' + JSON.stringify(responseJson));
      response.json(responseJson);
    }
  }
}
const richResponseV2Card = {
  'title': 'Title: this is a title',
  'subtitle': 'This is an subtitle.  Text can include unicode characters including emoji 📱.',
  'imageUri': 'https://developers.google.com/actions/images/badges/XPM_BADGING_GoogleAssistant_VER.png',
  'buttons': [
    {
      'text': 'This is a button',
      'postback': 'https://assistant.google.com/'
    }
  ]
};
const richResponsesV2 = [
  {
    'platform': 'ACTIONS_ON_GOOGLE',
    'simple_responses': {
      'simple_responses': [
        {
          'text_to_speech': 'Spoken simple response',
          'display_text': 'Displayed simple response'
        }
      ]
    }
  },
  {
    'platform': 'ACTIONS_ON_GOOGLE',
    'basic_card': {
      'title': 'Title: this is a title',
      'subtitle': 'This is an subtitle.',
      'formatted_text': 'Body text can include unicode characters including emoji 📱.',
      'image': {
        'image_uri': 'https://developers.google.com/actions/images/badges/XPM_BADGING_GoogleAssistant_VER.png'
      },
      'buttons': [
        {
          'title': 'This is a button',
          'open_uri_action': {
            'uri': 'https://assistant.google.com/'
          }
        }
      ]
    }
  },
  {
    'platform': 'FACEBOOK',
    'card': richResponseV2Card
  },
  {
    'platform': 'SLACK',
    'card': richResponseV2Card
  }
];

//Add a Story
exports.addStory = functions.https.onRequest((req, res) => {
  console.log('addStory headers: ' + JSON.stringify(req.headers));
  console.log('addStory Request body: ' + JSON.stringify(req.body));
  const EncryptedUser = req.body.param;
  var password = functions.config().my.token;

  var user = decrypt(EncryptedUser, password);

  var refUsers = db.ref("/Users");
  //Get the value for the specific userId
  refUsers.child(user).once('value', function(snapshot) {
      console.log(snapshot.val());
      if(!snapshot.val().profile.enabled){
        res.status(200).send('You are not authorized to add story');
        return null        
      }
  });

  var newStory = req.body;
  newStory.enabled = false;
  newStory.id = newStory.storyName.replace(/ /g,"_");
  delete newStory.param;
  var bookRef = admin.database().ref('/story-list');
  console.log('adding a new story');

  bookRef.child(newStory.id).set(newStory)
  .catch(function (err) {
      console.log('updatefailed', err)
  });   
  //res.status(200).send('Story Added Successfully');
  res.redirect(ADMIN_LINK+EncryptedUser+'&save=true');
  return null
});

//Send an email to admin when users request to be added
exports.RegisterEmail   = functions.https.onRequest((req, res) => {
    console.log(req.body)
    const email = 'ananyatadepalli@gmail.com'
    const APP_NAME = 'Book-Fairy';
    const EncryptedUser = req.body.param;
    var password = functions.config().my.token;

    var user = decrypt(EncryptedUser, password);
    console.log('Decrypted value: ' + user);  
    const mailOptions = {
      from: `${APP_NAME} <noreply@book-fairy.org>`,
      to: email
    };

  // The user subscribed to the newsletter.
    mailOptions.subject = `New Request from ${req.body.fname} ${req.body.lname}!`;

    //console.log(mailOptions.subject);
    mailOptions.text = `Hey new user request receive. ${JSON.stringify(req.body)}  userId=${user}`;
    //console.log(mailOptions.test);
    const mailTransport = nodemailer.createTransport(`smtps://${gmailEmail}:${gmailPassword}@smtp.gmail.com`);

    mailTransport.sendMail(mailOptions).then(() => {
      console.log('New welcome email sent to:', email);
    });
    //create the user record
    var usersRef = admin.database().ref('/Users');

    usersRef.child(user).set({profile: {id: user, fname: req.body.fname, lname: req.body.lname, email: req.body.email, enabled: false}})
    .catch(function (err) {
        console.log('Create User failed', err)
    });
    console.log('user Created');
    //create the book content records for the user
    var usersBooksRef = admin.database().ref('/UsersBooks');

    ref.orderByChild("enabled").equalTo(true).once('value').then(function(snapshot) {
      var myStories = snapshot.val();
      var storyData = Object.keys(myStories).map(e => myStories[e]);
      console.log('story data: '+storyData);
      //var storyUnread = storyData.map(a => a.storyName);  
      var bookNew = storyData.map( x => {
          x.Read = false;
          return x
        }); 
      console.log('bookNew: '+ bookNew);
      usersBooksRef.child(user).set({book: bookNew})
        .catch(function (err) {
          console.log('Create Book for User failed', err)
      });   
    }).then(() => {
      /*
      usersBooksRef.child(user).set({book: bookNew})
        .catch(function (err) {
          console.log('Create Book for User failed', err)
        }); 
      */
    });        
    console.log('userBooks Created');
    res.redirect('https://book-fairy.firebaseapp.com/thankyou.html')

});

//Provide user's bookList for editing
exports.UserBookData   = functions.https.onRequest((req, res) => {
  cors(req, res, () => {
    const EncryptedUser = req.query.text;
    //UserBookData.use(cors);
    console.log('req: '+JSON.stringify(req.body));
    var password = functions.config().my.token;
    console.log('Encrypted value: ' + EncryptedUser); 
    var user = decrypt(EncryptedUser, password);
    console.log('Decrypted value: ' + user);  
    //SentimentData.use(cors);
    //var usersBooksRef = admin.database().ref('/UsersBooks');
    admin.database().ref('/UsersBooks/' + user +'/book' ).once('value').then(function(snapshot) {
          //var username = snapshot.val().username;
          var myresult = snapshot.val()
          console.log((myresult));

      res.set('Access-Control-Allow-Origin', "*")
      res.set('Access-Control-Allow-Methods', 'GET, POST')
      //res.set('Access-Control-Allow-Headers','Origin, X-Requested-With, Content-Type, Accept')
      res.send(myresult);

    });
  });
});

//update user book list
exports.updateStoryStatus = functions.https.onRequest((req, res) => {
  console.log('updateStory Status headers: ' + JSON.stringify(req.headers));
  console.log('updateStory Status Request body: ' + JSON.stringify(req.body));
  const EncryptedUser = req.body.param;
  console.log(EncryptedUser);
  var password = functions.config().my.token;

  var user = decrypt(EncryptedUser, password);
  var usersBooksRef = admin.database().ref('/UsersBooks/'+user+'/book');
  
  usersBooksRef.once('value').then(function(snapshot) {
    var myStories = snapshot.val();
    var storyData = Object.keys(myStories).map(e => myStories[e]);
    var myReadStories =  req.body;

    for (var i = 0; i < storyData.length; i++) {
      console.log(storyData[i].id);
      console.log(myReadStories.hasOwnProperty(storyData[i].id));
      if (myReadStories[storyData[i].id]){
        storyData[i].Read = true;
      } else {
        storyData[i].Read = false;
      }
      var userBookRef = admin.database().ref('/UsersBooks/'+user+'/book/'+storyData[i].id);
      userBookRef.set(storyData[i]);
    }
    console.log('stroData: '+storyData);
    //usersBooksRef.set(storyData);
    console.log('userBooks Updated');
    res.redirect(CONFIGURE_LINK+EncryptedUser+'&save=true');
  });
});
// admin data
exports.adminData   = functions.https.onRequest((req, res) => {
  cors(req, res, () => {
    const EncryptedUser = req.query.text;
    //UserBookData.use(cors);
    console.log('req: '+JSON.stringify(req.body));
    var password = functions.config().my.token;
    console.log('Encrypted value: ' + EncryptedUser); 
    var user = decrypt(EncryptedUser, password);
    console.log('Decrypted value: ' + user);  
    //SentimentData.use(cors);
    //var usersBooksRef = admin.database().ref('/UsersBooks');
    
    admin.database().ref('/Users' ).child(user).once('value', function(snapshot) {
      console.log(snapshot.val());
      if(!snapshot.val().profile.admin){
        res.status(200).send('You are not authorized to add story');
        return null        
      }
    }).then(() => {

      var output = {};
      var key;
      admin.database().ref('/Users' ).once('value').then(function(snapshot) {
            //var username = snapshot.val().username;
        var myresult = snapshot.val()
        console.log((myresult));
        var userStatus = []
        for (key in myresult) {
          console.log('each user: '+JSON.stringify(myresult[key]));
          userStatus.push({id: myresult[key].profile.id, fname: myresult[key].profile.fname, lname: myresult[key].profile.lname, enabled:myresult[key].profile.enabled})
        }
        console.log(userStatus);
        output.users = userStatus;
      }).then(() => {
        admin.database().ref('/story-list' ).once('value').then(function(snapshot) {
              //var username = snapshot.val().username;
          console.log('output'+output.users);
          var myresult = snapshot.val()
          //var storyData = Object.keys(myStories).map(e => ({id: myStories[e].id, enabled: myStories[e].enabled}));
          //console.log('storydata'+storyData);
          var storyStatus = []
          for (key in myresult) {
            storyStatus.push({id: myresult[key].id, storyName: myresult[key].storyName, category: myresult[key].category, enabled:myresult[key].enabled})
          }
          console.log(storyStatus);
          output.stories = storyStatus;
          res.set('Access-Control-Allow-Origin', "*")
          res.set('Access-Control-Allow-Methods', 'GET, POST')
          //res.set('Access-Control-Allow-Headers','Origin, X-Requested-With, Content-Type, Accept')
          res.send(output);
        });
      });
    });
  });
});

//enable books
exports.updateBookStatus = functions.https.onRequest((req, res) => {
  console.log('updateStory Status headers: ' + JSON.stringify(req.headers));
  console.log('updateStory Status Request body: ' + JSON.stringify(req.body));
  const EncryptedUser = req.body.param;
  console.log('encrypted user'+EncryptedUser);
  var password = functions.config().my.token;

  var user = decrypt(EncryptedUser, password);
  console.log('decrypted user' + user);
  var usersBooksRef = admin.database().ref('/story-list');
  admin.database().ref('/Users' ).child(user).once('value', function(snapshot) {
    console.log(snapshot.val());
    if(!snapshot.val().profile.admin){
      res.status(200).send('You are not authorized to add story');
      return null        
    }
  }).then(() => {
    usersBooksRef.once('value').then(function(snapshot) {
      var myStories = snapshot.val();
      var storyData = Object.keys(myStories).map(e => myStories[e]);
      var myReadStories =  req.body;

      for (var i = 0; i < storyData.length; i++) {
        console.log(storyData[i].id);
        console.log('storyData[i]: '+JSON.stringify(storyData[i]));
        console.log(myReadStories.hasOwnProperty(storyData[i].id));
        if (myReadStories[storyData[i].id]){
          storyData[i].enabled = true;
        } else {
          storyData[i].enabled = false;
        }
        var BookRef = admin.database().ref('/story-list/'+storyData[i].id);
        BookRef.set(storyData[i]);
        storyData[i].Read = false;
        //need to add code to ensure that all enabled stories are available for all users
        console.log('story enabled: '+storyData[i].enabled);

      }
      //console.log('stroData: '+storyData);
      //usersBooksRef.set(storyData);
      console.log('userBooks Updated');
      res.redirect(ADMIN_LINK+EncryptedUser+'&save=true');
    });
    /*.then(() => {
        //console.log('story name enabled: '+storyData[i].storyName);
        var userBookRef = admin.database().ref('/UsersBooks');
        userBookRef.once('value').then(function(snapshot) {
          var users = snapshot.val();
          var userIds = Object.keys(users);
          console.log('userIds: '+userIds);
          for ( i=0; i < userIds.length; i++  ) {
            console.log('userId: '+userIds[i]);
            var userStoryRef = admin.database().ref('/UsersBooks/'+userIds[i]+'/book');
            userStoryRef.child(storyData[i].id).set(storyData[i])
          }
        });
    });*/
  });
});

// enable users
exports.enableUsers = functions.https.onRequest((req, res) => {
  console.log('enableUsers Status headers: ' + JSON.stringify(req.headers));
  console.log('enableUsers Status Request body: ' + JSON.stringify(req.body));
  const EncryptedUser = req.body.param;
  console.log('encrypted user'+EncryptedUser);
  var password = functions.config().my.token;

  var user = decrypt(EncryptedUser, password);
  console.log('decrypted user'+user);

  var usersRef = admin.database().ref('/Users');
  admin.database().ref('/Users' ).child(user).once('value', function(snapshot) {
    console.log(snapshot.val());
    if(!snapshot.val().profile.admin){
      res.status(200).send('You are not authorized to add story');
      return null        
    }
  }).then(() => {
    usersRef.once('value').then(function(snapshot) {
      var Users = snapshot.val();
      var userData = Object.keys(Users).map(e => Users[e]);
      var myUserStatus =  req.body;
      var users = [];
      for (var i = 0; i < userData.length; i++) {
        console.log(userData[i].profile.id);
        console.log(myUserStatus.hasOwnProperty(userData[i].profile.id));
        if (myUserStatus[userData[i].profile.id]){
          userData[i].profile.enabled = true;
        } else {
          userData[i].profile.enabled = false;
        }
        var user = {};
        user[userData[i].profile.id] = userData[i]
        users.push(user);
        var userRef = admin.database().ref('/Users/'+userData[i].profile.id);
        console.log('Data to be stored: '+JSON.stringify(userData[i]));
        
        userRef.set(userData[i]);
      }
      console.log('Data to be stored: '+JSON.stringify(users));
      //usersRef.set(users);
      console.log('userBooks Updated');
      res.redirect(ADMIN_LINK+EncryptedUser+'&save=true');
    });
  });
});
//functions to handle encryption and decryption
//exports.check = check;

//db trigger
exports.updateUserStories = functions.database.ref('/story-list/{storyId}')
    .onWrite(event => {
      // Grab the current value of what was written to the Realtime Database.
      const story = event.data.val();
      console.log('story Updated: '+ JSON.stringify(story));
      if (story.enabled) {
        var userBookRef = admin.database().ref('/UsersBooks');
        userBookRef.once('value').then(function(snapshot) {
          var users = snapshot.val();
          var userIds = Object.keys(users);
          console.log('Number of users: '+userIds.length);
          for ( var i=0; i < userIds.length; i++  ) {
            console.log('userId: '+userIds[i]);
            var userStoryRef = admin.database().ref('/UsersBooks/'+userIds[i]+'/book');
            story.Read = false;
            userStoryRef.child(story.id).set(story);
          }
        });
      }
      return null
      //event.data.ref.parent.child('uppercase').set(uppercase);
    });


var crypto = require('crypto');

var encrypt = function encrypt(input, password) {
        var key = generateKey(password);
        //console.log('key2: '+key);
        var initializationVector = generateInitializationVector(password, key);

        var data = new Buffer(input.toString(), 'utf8').toString('binary');

        var cipher = crypto.createCipheriv('aes-256-cbc', key, initializationVector.slice(0,16));
        var encrypted = cipher.update(data, 'utf8', 'hex');
        encrypted += cipher.final('hex');   
        var encoded = new Buffer(encrypted, 'binary').toString('base64');

        return encoded;
};

var decrypt = function decrypt(input, password) {
        var key = generateKey(password);
        //console.log('key2: '+key);
        var initializationVector = generateInitializationVector(password, key);

        var input = input.replace(/\-/g, '+').replace(/_/g, '/');
        var edata = new Buffer(input, 'base64').toString('binary');

        var decipher = crypto.createDecipheriv('aes-256-cbc', key, initializationVector.slice(0,16));
        var decrypted = decipher.update(edata, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        var decoded = new Buffer(decrypted, 'binary').toString('utf8');

        return decoded;
};

var generateKey = function generateKey(password) {
    var cryptographicHash = crypto.createHash('md5');
    cryptographicHash.update(password);
    var key = cryptographicHash.digest('hex');
    //console.log('key1: '+key);
    return key;
}

var generateInitializationVector = function generateInitializationVector(password, key) {
    var cryptographicHash = crypto.createHash('md5');
    cryptographicHash.update(password + key);
    //console.log('password: ' + password);
    //console.log('key3: '+key);
    var initializationVector = cryptographicHash.digest('hex');
    //console.log('initializationVector: '+initializationVector);
    return initializationVector;
}
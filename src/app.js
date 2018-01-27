/**
 * Copyright 2017 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

const apiai = require('apiai');
const express = require('express');
const bodyParser = require('body-parser');
const uuid = require('node-uuid');
const request = require('request');
const JSONbig = require('json-bigint');
const async = require('async');
const config = require('config');
const Client = require('node-rest-client').Client;
const QrCode = require('qrcode-reader');
const utils = require('./utils/Common');
const _ = require('lodash');
const Buffer = require('safe-buffer').Buffer;


const APIAI_ACCESS_TOKEN = (process.env.APIAI_ACCESS_TOKEN)
  ? process.env.APIAI_ACCESS_TOKEN
  : config.get('env.APIAI_ACCESS_TOKEN.value');
const APIAI_LANG = process.env.APIAI_LANG || 'en';
const FB_VERIFY_TOKEN = (process.env.FB_VERIFY_TOKEN)
  ? process.env.FB_VERIFY_TOKEN
  : config.get('env.FB_VERIFY_TOKEN.value');
const FB_PAGE_ACCESS_TOKEN = (process.env.FB_PAGE_ACCESS_TOKEN)
  ? process.env.FB_PAGE_ACCESS_TOKEN
  : config.get('env.FB_PAGE_ACCESS_TOKEN.value');

const WEATHER_API = (process.env.WEATHER_API)
  ? process.env.WEATHER_API
  : config.get('env.WEATHER_API.value');

const TRANSLATION_API = (process.env.TRANSLATION_API)
  ? process.env.TRANSLATION_API
  : config.get('env.TRANSLATION_API.value');

const LOCATION_API = (process.env.LOCATION_API)
  ? process.env.LOCATION_API
  : config.get('env.LOCATION_API.value');

const FB_TEXT_LIMIT = 640;

const FACEBOOK_LOCATION = "FACEBOOK_LOCATION";
const FACEBOOK_WELCOME = "FACEBOOK_WELCOME";

const FBBotFramework = require('fb-bot-framework');
const bot = new FBBotFramework({page_token: config.get('env.FB_PAGE_ACCESS_TOKEN.value'), verify_token: config.get('env.FB_VERIFY_TOKEN.value')});

class FacebookBot {
  constructor() {
    this.apiAiService = apiai(APIAI_ACCESS_TOKEN, {
      language: APIAI_LANG,
      requestSource: "fb"
    });
    this.sessionIds = new Map();
    this.messagesDelay = 200;
  }

  doDataResponse(sender, facebookResponseData) {
    if (!Array.isArray(facebookResponseData)) {
      console.log('Response as formatted message');
      this.sendFBMessage(sender, facebookResponseData).catch(err => console.error(err));
    } else {
      async.eachSeries(facebookResponseData, (facebookMessage, callback) => {
        if (facebookMessage.sender_action) {
          console.log('Response as sender action');
          this.sendFBSenderAction(sender, facebookMessage.sender_action).then(() => callback()).catch(err => callback(err));
        } else {
          console.log('Response as formatted message');
          this.sendFBMessage(sender, facebookMessage).then(() => callback()).catch(err => callback(err));
        }
      }, (err) => {
        if (err) {
          console.error(err);
        } else {
          console.log('Data response completed');
        }
      });
    }
  }

  doRichContentResponse(sender, messages) {
    console.log('i am here')
    let facebookMessages = []; // array with result messages

    for (let messageIndex = 0; messageIndex < messages.length; messageIndex++) {
      let message = messages[messageIndex];

      switch (message.type) {
          //message.type 0 means text message
        case 0:
          // speech: ["hi"]
          // we have to get value from fulfillment.speech, because of here is raw speech
          if (message.speech) {
            let splittedText = this.splitResponse(message.speech);

            splittedText.forEach(s => {
              facebookMessages.push({text: s});
            });
          }

          break;
          //message.type 1 means card message
        case 1:
          {
            let carousel = [message];

            for (messageIndex++; messageIndex < messages.length; messageIndex++) {
              if (messages[messageIndex].type == 1) {
                carousel.push(messages[messageIndex]);
              } else {
                messageIndex--;
                break;
              }
            }

            let facebookMessage = {};
            carousel.forEach((c) => {
              // buttons: [ {text: "hi", postback: "postback"} ], imageUrl: "", title: "", subtitle: ""

              let card = {};

              card.title = c.title;
              card.image_url = c.imageUrl;
              if (this.isDefined(c.subtitle)) {
                card.subtitle = c.subtitle;
              }
              //If button is involved in.
              if (c.buttons.length > 0) {
                let buttons = [];
                for (let buttonIndex = 0; buttonIndex < c.buttons.length; buttonIndex++) {
                  let button = c.buttons[buttonIndex];

                  if (button.text) {
                    let postback = button.postback;
                    if (!postback) {
                      postback = button.text;
                    }

                    let buttonDescription = {
                      title: button.text
                    };

                    if (postback.startsWith("http")) {
                      buttonDescription.type = "web_url";
                      buttonDescription.url = postback;
                    } else {
                      buttonDescription.type = "postback";
                      buttonDescription.payload = postback;
                    }

                    buttons.push(buttonDescription);
                  }
                }

                if (buttons.length > 0) {
                  card.buttons = buttons;
                }
              }

              if (!facebookMessage.attachment) {
                facebookMessage.attachment = {
                  type: "template"
                };
              }

              if (!facebookMessage.attachment.payload) {
                facebookMessage.attachment.payload = {
                  template_type: "generic",
                  elements: []
                };
              }

              console.log('card',card)
              facebookMessage.attachment.payload.elements.push(card);
            });

            facebookMessages.push(facebookMessage);
          }

          break;
          //message.type 2 means quick replies message
        case 2:
          {
            if (message.replies && message.replies.length > 0) {
              let facebookMessage = {};

              facebookMessage.text = message.title
                ? message.title
                : 'Choose an item';
              facebookMessage.quick_replies = [];

              message.replies.forEach((r) => {
                facebookMessage.quick_replies.push({content_type: "text", title: r, payload: r});
              });

              facebookMessages.push(facebookMessage);
            }
          }

          break;
          //message.type 3 means image message
        case 3:

          if (message.imageUrl) {
            let facebookMessage = {};

            // "imageUrl": "http://example.com/image.jpg"
            facebookMessage.attachment = {
              type: "image"
            };
            facebookMessage.attachment.payload = {
              url: message.imageUrl
            };

            facebookMessages.push(facebookMessage);
          }

          break;
          //message.type 4 means custom payload message
        case 4:
          if (message.payload && message.payload.facebook) {
            facebookMessages.push(message.payload.facebook);
          }
          break;

        default:
          break;
      }
    }

    return new Promise((resolve, reject) => {
      async.eachSeries(facebookMessages, (msg, callback) => {
        this.sendFBSenderAction(sender, "typing_on").then(() => this.sleep(this.messagesDelay)).then(() => this.sendFBMessage(sender, msg)).then(() => callback()).catch(callback);
      }, (err) => {
        if (err) {
          console.error(err);
          reject(err);
        } else {
          console.log('Messages sent');
          resolve();
        }
      });
    });

  }

  doTextResponse(sender, responseText) {
    console.log('Response as text message');
    // facebook API limit for text length is 640,
    // so we must split message if needed
    let splittedText = this.splitResponse(responseText);

    async.eachSeries(splittedText, (textPart, callback) => {
      this.sendFBMessage(sender, {text: textPart}).then(() => callback()).catch(err => callback(err));
    });
  }

  //which webhook event
  getEventText(event) {
    if (event.message) {
      if (event.message.quick_reply && event.message.quick_reply.payload) {
        return event.message.quick_reply.payload;
      }

      if (event.message.text) {
        return event.message.text;
      }
    }

    if (event.postback && event.postback.payload) {
      return event.postback.payload;
    }

    return null;

  }

  getFacebookEvent(event) {
    if (event.postback && event.postback.payload) {

      let payload = event.postback.payload;

      switch (payload) {
        case FACEBOOK_WELCOME:
          return {name: FACEBOOK_WELCOME};

        case FACEBOOK_LOCATION:
          return {name: FACEBOOK_LOCATION, data: event.postback.data}
      }
    }

    return null;
  }

  processFacebookEvent(event) {
    const sender = event.sender.id.toString();
    const eventObject = this.getFacebookEvent(event);

    if (eventObject) {

      // Handle a text message from this sender
      if (!this.sessionIds.has(sender)) {
        this.sessionIds.set(sender, uuid.v4());
      }

      let apiaiRequest = this.apiAiService.eventRequest(eventObject, {
        sessionId: this.sessionIds.get(sender),
        originalRequest: {
          data: event,
          source: "facebook"
        }
      });
      this.doApiAiRequest(apiaiRequest, sender);
    }
  }

  processMessageEvent(event) {
    const sender = event.sender.id.toString();
    const text = this.getEventText(event);

    if (text) {

      // Handle a text message from this sender
      if (!this.sessionIds.has(sender)) {
        this.sessionIds.set(sender, uuid.v4());
      }

      console.log("Text", text);
      //send user's text to api.ai service
      let apiaiRequest = this.apiAiService.textRequest(text, {
        sessionId: this.sessionIds.get(sender),
        originalRequest: {
          data: event,
          source: "facebook"
        }
      });

      this.doApiAiRequest(apiaiRequest, sender);
    }
  }

  doApiAiRequest(apiaiRequest, sender) {
    apiaiRequest.on('response', (response) => {
      console.log('response', response)
      if (this.isDefined(response.result) && this.isDefined(response.result.fulfillment)) {
        let responseText = response.result.fulfillment.speech;
        let responseData = response.result.fulfillment.data;
        let responseMessages = response.result.fulfillment.messages;
        let action = response.result.action;
        let parameters = response.result.parameters;
        let resolvedQuery = response.result.resolvedQuery;
        // if (response.result.contexts) {
        //
        // }
        // console.log('responseText', responseText)
        // console.log('responseData', responseData)
        // console.log('responseMessages', responseMessages)
        // console.log('action', action)
        if (this.isDefined(responseData) && this.isDefined(responseData.facebook)) {
          let facebookResponseData = responseData.facebook;
          this.doDataResponse(sender, facebookResponseData);
        } else if (this.isDefined(responseMessages) && responseMessages.length > 0) {
          if (action.search("smalltalk.greetings") > -1) {
            var that = this;
            bot.getUserProfile(sender, function(err, profile) {
              if (!err) {
                responseMessages[0].speech = responseMessages[0].speech + ' ' + profile.first_name + '!';
                that.doRichContentResponse(sender, responseMessages);
                console.log('sender', sender)
              } else {
                console.log('err', err)
                that.doRichContentResponse(sender, responseMessages);
              }
            });
          } else if (action.search("input.welcome") > -1) {
            console.log('inside input.welcome')
            var that = this;
            bot.getUserProfile(sender, function(err, profile) {
              if (!err) {
                // responseMessages[0].speech = responseMessages[0].speech + ' ' + profile.first_name + '!';
                // responseMessages[0].speech = responseMessages[0].speech + ' Welcome to Emirates Travel Assistant, your one stop shop for all your travel needs where you can search for flights, book your hotels and experiences on the discounted price, Translate phrases to and from languages, get weather updates.Furthermore search for sights, entertainment, transportation, local services and shops and more. Enjoy! ;)'
                // console.log('responseMessages',responseMessages)
                // that.doRichContentResponse(sender, responseMessages);
                that.doTextResponse(sender, "Hi " + profile.first_name + '! Welcome to Emirates Travel Assistant, your one stop shop for all your travel needs where you can search for flights, book your hotels and experiences on the discounted price, Translate phrases to and from languages, get weather updates.Furthermore search for sights, entertainment, transportation, local services and shops and more. Enjoy! ;)');

                var skyWardsJson = [
                  {
                    type: 1,
                    imageUrl: "https://s3-ap-southeast-1.amazonaws.com/tempviafone/emirates-skywards.jpg",
                    title: "Link your Skywards account",
                    subtitle: "Please link your skywards account to get more personalized experience.",
                    buttons: [
                      {
                        postback: "https://ekbot1.herokuapp.com/login",
                        text: "Login"
                      }
                    ]
                  }
                ];

                that.doRichContentResponse(sender, skyWardsJson);
                setTimeout(function(){
                  var parsedJSON = require('./json/menu.json');
                  console.log('parsedJSON', parsedJSON)
                  that.doRichContentResponse(sender, parsedJSON);
                },8000);

              } else {
                console.log('err', err)
                that.doRichContentResponse(sender, responseMessages);
              }
            });
          } else if (action.search("flight.search") > -1) {
            console.log('responseMessages', responseMessages)
            console.log('flight.search')
            console.log('parameters', parameters)
            var parsedJSON = require('./json/flight-1.json');
            console.log('parsedJSON', parsedJSON)
            var testJson = [
              {
                type: 1,
                imageUrl: "https://s3-ap-southeast-1.amazonaws.com/tempviafone/flight12.PNG",
                title: "Best offer",
                subtitle: "AED 2410 \r\n 1 Adult | Economy class",
                buttons: [
                  {
                    postback: "https://fly10.emirates.com/IBE.aspx?pub=/english&pageurl=/SelectPrice.aspx&section=IBE&showpage=true&TID=SB&seldcity1=DXB&selacity1=JFK&selddate1=26 Nov 2017&seladate1=07 Jan 2018&seladults=1&selchildren=0&selinfants=0&selcabinclasstype=Economy&selcabinclass=0&resultby=0&recentsearches=true&j=t&reasoncode=RecentSearch",
                    text: "Book this flight"
                  }, {
                    text: "Set price alerts",
                    postback: "PRICE_ALERTS"
                  }
                ]
              }, {
                type: 1,
                imageUrl: "https://s3-ap-southeast-1.amazonaws.com/tempviafone/flight12.PNG",
                title: "Cheapest offer",
                subtitle: "AED 2190 \r\n 1 Adult | Economy class",
                buttons: [
                  {
                    postback: "https://fly10.emirates.com/IBE.aspx?pub=/english&pageurl=/SelectPrice.aspx&section=IBE&showpage=true&TID=SB&seldcity1=DXB&selacity1=JFK&selddate1=26 Nov 2017&seladate1=07 Jan 2018&seladults=1&selchildren=0&selinfants=0&selcabinclasstype=Economy&selcabinclass=0&resultby=0&recentsearches=true&j=t&reasoncode=RecentSearch",
                    text: "Book this flight"
                  }, {
                    text: "Set price alerts",
                    postback: "PRICE_ALERTS"
                  }
                ]
              }
            ];
            this.doRichContentResponse(sender, parsedJSON);
          } else if (action.search("PAY_LOAD") > -1) {
            if (resolvedQuery == "PRICE_ALERTS") {
              var customPaylod = [
                {
                  type: 4,
                  payload: {
                    facebook: {
                      "attachment": {
                        "type": "template",
                        "payload": {
                          "template_type": "button",
                          "text": "The alert is now set. We will check the price daily and inform you about changes.",
                          "buttons": [
                            {
                              "type": "postback",
                              "payload": "UN_SUBSCRIBE",
                              "title": "Unsubscribe"
                            }
                          ]
                        }

                      }
                    }
                  }
                }
              ];

              this.doRichContentResponse(sender, customPaylod);
            } else if (resolvedQuery == "UN_SUBSCRIBE") {
              this.doTextResponse(sender, "You will no longer receive alerts for this fare.");
            }else if (resolvedQuery == "MENU_EXPLORE_WORLD") {
              this.doTextResponse(sender, "You can search for tourist attractions, local transportation options and entertainment, as well as filter the results by distance, price and availability");
              this.doTextResponse(sender, "Examples\r\nBest restaurants in dubai \r\nTop tourist attractions in dubai \r\nTop destinations in singapore \r\nTourist places in london");
            }else if (resolvedQuery == "MENU_SEARCH_FLIGHT") {
                this.doTextResponse(sender, "Search for flights, book flights and answer FAQ");
                this.doTextResponse(sender, "Examples\r\nFind a flight from Dubai to Newyork on July 16, returning July 23. \r\nHow do I check in online? \r\nSearch flights from KHI to DXB on 12 Jan \r\nWhat's the maximum baggage size?");
              }else if (resolvedQuery == "MENU_TRANSLATE") {
                  this.doTextResponse(sender, "Ask for translations when travelling in a foreign land. You can quickly switch between the many supported languages, to ensure you have the phrase when you need it");
                  this.doTextResponse(sender, "Examples\r\nTranslate Thankyou into French. \r\nWhat's the German word for breakfast \r\nHow do you say hi in arabic \r\n");
                }else if (resolvedQuery == "MENU_WEATHER") {
                    this.doTextResponse(sender, "Get weather updates related to outdoor activities or see if you need that umbrella.");
                    this.doTextResponse(sender, "Examples\r\nWhat's the weather in New York?\r\nHow is the weather? \r\nHow about singapore? \r\n");
                  }else if (resolvedQuery == "MENU_DEALS") {
                      this.doTextResponse(sender, "Get nearby deals and offers");
                      var parsedJSON = require('./json/deals.json');
                      console.log('parsedJSON', parsedJSON)
                      this.doRichContentResponse(sender, parsedJSON);
                    }else if (resolvedQuery == "MENU_MENU") {
                      var parsedJSON = require('./json/menu.json');
                      console.log('parsedJSON', parsedJSON)
                      this.doRichContentResponse('1503503856363974', parsedJSON);
                      }






          } else if (action.search("weather") > -1) {
            console.log('parameters', parameters)
            var that = this;
            var client = new Client();
            var args = {
              headers: {
                "Content-Type": "application/json"
              }
            };

            if (parameters.date_time) {
              parameters.date_time = new Date(parameters.date_time).toISOString();
            } else {
              parameters.date_time = new Date().toISOString();
            }

            if (!parameters.address || parameters.address == '')
              parameters.address = {
                city: 'Dubai'
              }

            if (parameters.address && parameters.address['business-name']) {
              parameters.address = {
                city: parameters.address['business-name']
              }
            }

            if (!parameters.outfit)
              parameters.outfit = ''

            args.data = parameters;

            console.log('args.data', args.data)
            client.post(WEATHER_API + 'getWeather', args, function(data, response) {
              console.log('data', data)
              if (data && data.responseText) {
                that.doTextResponse(sender, data.responseText);
              } else {
                that.doTextResponse(sender, "Can you please be more specific?");
              }

            })

          } else if (action.search("translate") > -1) {
            console.log('parameters', parameters)
            var that = this;
            var client = new Client();
            var args = {
              headers: {
                "Content-Type": "application/json"
              }
            };

            args.data = {
              "target": parameters['lang-to'],
              "text": parameters.text
            };
            console.log('args.data', args.data)
            client.post(WEATHER_API + 'translateLan', args, function(data, response) {
              console.log('data', data)
              if (data && data.data && data.data.translations) {
                console.log('data.data.translations', data.data.translations)
                that.doTextResponse(sender, data.data.translations[0].translatedText);
              } else {
                that.doTextResponse(sender, "Can you please be more specific?");
              }

            })

          } else if (action.search("venues") > -1) {

            console.log('resolvedQuery', resolvedQuery)
            var that = this;
            var client = new Client();

            client.get(LOCATION_API + resolvedQuery, function(data, response) {
              // console.log('data', data)
              data = JSON.parse(data)
              console.log('data', data)

              if(data && data[0] != null && !data.Message)
              {
                    data.forEach(function(v,i) {
                        if(data[i] != null)
                         data[i].type = 1
                         data[i].imageUrl = data[i].image
                         data[i].buttons =[{text: "Website", postback: data[i].website}]

                      });
              // console.log('data',data)
              that.doRichContentResponse(sender,data);
            }
            })

          } else {
            this.doRichContentResponse(sender, responseMessages);
          }
        } else if (this.isDefined(responseText)) {
          this.doTextResponse(sender, responseText);
        }

      }
    });

    apiaiRequest.on('error', (error) => console.error(error));
    apiaiRequest.end();
  }

  splitResponse(str) {
    if (str.length <= FB_TEXT_LIMIT) {
      return [str];
    }

    return this.chunkString(str, FB_TEXT_LIMIT);
  }

  chunkString(s, len) {
    let curr = len,
      prev = 0;

    let output = [];

    while (s[curr]) {
      if (s[curr++] == ' ') {
        output.push(s.substring(prev, curr));
        prev = curr;
        curr += len;
      } else {
        let currReverse = curr;
        do {
          if (s.substring(currReverse - 1, currReverse) == ' ') {
            output.push(s.substring(prev, currReverse));
            prev = currReverse;
            curr = currReverse + len;
            break;
          }
          currReverse--;
        } while (currReverse > prev)
      }
    }
    output.push(s.substr(prev));
    return output;
  }

  sendFBMessage(sender, messageData) {
    console.log('messageData', messageData)
    return new Promise((resolve, reject) => {
      request({
        url: 'https://graph.facebook.com/v2.6/me/messages',
        qs: {
          access_token: FB_PAGE_ACCESS_TOKEN
        },
        method: 'POST',
        json: {
          recipient: {
            id: sender
          },
          message: messageData
        }
      }, (error, response) => {
        if (error) {
          console.log('Error sending message: ', error);
          reject(error);
        } else if (response.body.error) {
          console.log('Error: ', response.body.error);
          reject(new Error(response.body.error));
        }

        resolve();
      });
    });
  }

  sendFBSenderAction(sender, action) {
    return new Promise((resolve, reject) => {
      request({
        url: 'https://graph.facebook.com/v2.6/me/messages',
        qs: {
          access_token: FB_PAGE_ACCESS_TOKEN
        },
        method: 'POST',
        json: {
          recipient: {
            id: sender
          },
          sender_action: action
        }
      }, (error, response) => {
        if (error) {
          console.error('Error sending action: ', error);
          reject(error);
        } else if (response.body.error) {
          console.error('Error: ', response.body.error);
          reject(new Error(response.body.error));
        }

        resolve();
      });
    });
  }

  doSubscribeRequest() {
    request({
      method: 'POST',
      uri: `https://graph.facebook.com/v2.6/me/subscribed_apps?access_token=${FB_PAGE_ACCESS_TOKEN}`
    }, (error, response, body) => {
      if (error) {
        console.error('Error while subscription: ', error);
      } else {
        console.log('Subscription result: ', response.body);
      }
    });
  }

  configureGetStartedEvent() {
    request({
      method: 'POST',
      uri: `https://graph.facebook.com/v2.6/me/thread_settings?access_token=${FB_PAGE_ACCESS_TOKEN}`,
      json: {
        setting_type: "call_to_actions",
        thread_state: "new_thread",
        call_to_actions: [
          {
            payload: FACEBOOK_WELCOME
          }
        ]
      }
    }, (error, response, body) => {
      if (error) {
        console.error('Error while subscription', error);
      } else {
        console.log('Subscription result', response.body);
      }
    });
  }

  isDefined(obj) {
    if (typeof obj == 'undefined') {
      return false;
    }

    if (!obj) {
      return false;
    }

    return obj != null;
  }

  sleep(delay) {
    return new Promise((resolve, reject) => {
      setTimeout(() => resolve(), delay);
    });
  }

}

let facebookBot = new FacebookBot();

const app = express();
app.set('case sensitive routing', true);
app.use(bodyParser.json());


app.get('/webhook/', (req, res) => {
  if (req.query['hub.verify_token'] === FB_VERIFY_TOKEN) {
    res.send(req.query['hub.challenge']);

    setTimeout(() => {
      facebookBot.doSubscribeRequest();
    }, 3000);
  } else {
    res.send('Error, wrong validation token');
  }
});

app.get('/sendMenu', (req, res) => {
  try {
    var parsedJSON = require('./json/menu.json');
    console.log('parsedJSON', parsedJSON)
    facebookBot.doRichContentResponse('1503503856363974', parsedJSON);
  } catch (err) {
    return res.status(400).json({status: "error", error: err});
  }
});


app.get('/sendDeals', (req, res) => {
  try {
    var parsedJSON = require('./json/deals.json');
    console.log('parsedJSON', parsedJSON)
    facebookBot.doRichContentResponse('1503503856363974', parsedJSON);
  } catch (err) {
    return res.status(400).json({status: "error", error: err});
  }
});

app.get('/sendFlightBoarding', (req, res) => {
  try {
    var parsedJSON = require('./json/flight.boarding.json');
    console.log('parsedJSON', parsedJSON)
    facebookBot.doRichContentResponse('1503503856363974', parsedJSON);
  } catch (err) {
    return res.status(400).json({status: "error", error: err});
  }
});

app.get('/sendFlightCheckIn', (req, res) => {
  try {
    var parsedJSON = require('./json/flight.checkin.json');
    console.log('parsedJSON', parsedJSON)
    facebookBot.doRichContentResponse('1503503856363974', parsedJSON);
  } catch (err) {
    return res.status(400).json({status: "error", error: err});
  }
});

app.get('/', (req, res) => {
return res.status(200).json({});
});

app.get('/sendBookingItinerary', (req, res) => {
  try {
    var parsedJSON = require('./json/booking.itinerary.json');
    console.log('parsedJSON', parsedJSON)
    // facebookBot.doTextResponse('1503503856363974', "You will no longer receive alerts for this fare.");

    facebookBot.doRichContentResponse('1503503856363974', parsedJSON);
  } catch (err) {
    return res.status(400).json({status: "error", error: err});
  }
});
app.post('/webhook/', (req, res) => {
  try {
    const data = JSONbig.parse(req.body);

    if (data.entry) {
      let entries = data.entry;
      entries.forEach((entry) => {
        let messaging_events = entry.messaging;
        if (messaging_events) {
          messaging_events.forEach((event) => {
            if (event.message && !event.message.is_echo) {

              if (event.message.attachments) {
                let locations = event.message.attachments.filter(a => a.type === "location");

                // delete all locations from original message
                event.message.attachments = event.message.attachments.filter(a => a.type !== "location");

                if (locations.length > 0) {
                  locations.forEach(l => {
                    let locationEvent = {
                      sender: event.sender,
                      postback: {
                        payload: "FACEBOOK_LOCATION",
                        data: l.payload.coordinates
                      }
                    };

                    facebookBot.processFacebookEvent(locationEvent);
                  });
                }
              }

              facebookBot.processMessageEvent(event);
            } else if (event.postback && event.postback.payload) {
              if (event.postback.payload === "FACEBOOK_WELCOME") {
                facebookBot.processFacebookEvent(event);
              } else {
                facebookBot.processMessageEvent(event);
              }
            }
          });
        }
      });
    }

    return res.status(200).json({status: "ok"});
  } catch (err) {
    return res.status(400).json({status: "error", error: err});
  }

});

app.post('/echo', (req, res) => {
  res.status(200).json({ message: req.body.message }).end();
});



function authInfoHandler (req, res) {
  let authUser = { id: 'anonymous' };
  const encodedInfo = req.get('X-Endpoint-API-UserInfo');
  if (encodedInfo) {
    authUser = JSON.parse(Buffer.from(encodedInfo, 'base64'));
  }
  res.status(200).json(authUser).end();
}

app.get('/auth/info/googlejwt', authInfoHandler);
app.get('/auth/info/googleidtoken', authInfoHandler);

if (module === require.main) {
  // [START listen]
  const PORT = process.env.PORT || 8080;
  app.listen(PORT, () => {
    console.log(`App listening on port ${PORT}`);
    console.log('Press Ctrl+C to quit.');
  });
  // [END listen]
}
// [END app]

facebookBot.doSubscribeRequest();
module.exports = app;

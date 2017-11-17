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

const REST_PORT = (process.env.PORT || 80);
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
const API_URL = (process.env.API_URL)
  ? process.env.API_URL
  : config.get('env.API_URL.value');
const API_CLIENT = (process.env.API_CLIENT)
  ? process.env.API_CLIENT
  : config.get('env.API_CLIENT.value');
const API_KEY = (process.env.API_KEY)
  ? process.env.API_KEY
  : config.get('env.API_KEY.value');
const LOGIN_API = (process.env.LOGIN_API)
  ? process.env.LOGIN_API
  : config.get('env.LOGIN_API.value');

const apiAiService = apiai(APIAI_ACCESS_TOKEN, {
  language: APIAI_LANG,
  requestSource: "fb"
});
const sessionIds = new Map();
const firstNames = new Map();
const spIds = new Map();
const spTokens = new Map();
const location = new Map();
const queryText = new Map();

var FBBotFramework = require('fb-bot-framework');
var bot = new FBBotFramework({page_token: config.get('env.FB_PAGE_ACCESS_TOKEN.value'), verify_token: config.get('env.FB_VERIFY_TOKEN.value')});


function processEvent(event) {
  var sender = event.sender.id.toString();
  console.log('sender', sender)
  console.log('event', event)
  if ((event.message && event.message.text) || (event.postback && event.postback.payload)) {
    var text = event.message
      ? event.message.text
      : event.postback.payload;
    // Handle a text message from this sender
    if (event.message && event.message.quick_reply && event.message.quick_reply.payload) {
      text = event.message.quick_reply.payload;

    }

    if (event.message && event.message.text && queryText.get(sender) == 'SEARCH') {
      queryText.delete(sender);
      return searchCampigns(sender, text);
    }

    if (!sessionIds.has(sender)) {
      sessionIds.set(sender, uuid.v4());
    }

    console.log("Text", text);

    let apiaiRequest = apiAiService.textRequest(text, {
      sessionId: sessionIds.get(sender),
      originalRequest: {
        data: event,
        source: "facebook"
      }
    });

    apiaiRequest.on('response', (response) => {
      console.log('response123', response)
      if (isDefined(response.result)) {
        let responseText = response.result.fulfillment.speech;
        let responseData = response.result.fulfillment.data;
        let action = response.result.action;

        if (isDefined(responseData) && isDefined(responseData.facebook)) {
          if (!Array.isArray(responseData.facebook)) {
            try {
              console.log('Response as formatted message');
              sendFBMessage(sender, responseData.facebook);
            } catch (err) {
              sendFBMessage(sender, {text: err.message});
            }
          } else {
            async.eachSeries(responseData.facebook, (facebookMessage, callback) => {
              try {
                if (facebookMessage.sender_action) {
                  console.log('Response as sender action');
                  sendFBSenderAction(sender, facebookMessage.sender_action, callback);
                } else {
                  console.log('Response as formatted message');
                  sendFBMessage(sender, facebookMessage, callback);
                }
              } catch (err) {
                sendFBMessage(sender, {
                  text: err.message
                }, callback);
              }
            });
          }
        } else if (isDefined(responseText)) {
          console.log('Response as text message');
          // facebook API limit for text length is 320,
          // so we must split message if needed
          console.log('response.result.metadata.intentName', response.result.metadata.intentName)
          switch (response.result.metadata.intentName) {
            case 'Default Welcome Intent':
              if (!firstNames.has(sender)) {
                bot.getUserProfile(sender, function(err, profile) {
                  if (!err) {
                    console.log('profile', profile)
                    firstNames.set(sender, profile.first_name);
                    responseText = responseText + ' ' + profile.first_name + '!';
                    sendFBMessage(sender, {text: responseText});
                  } else {
                    console.log('err', err)
                  }
                });
              } else {
                responseText = responseText + ' ' + firstNames.get(sender) + '!';
                sendFBMessage(sender, {text: responseText});
              }
              break;
            default:
              console.log('responseText default', responseText)
              var splittedText = splitResponse(responseText);
              async.eachSeries(splittedText, (textPart, callback) => {
                sendFBMessage(sender, {
                  text: textPart
                }, callback);
              });
          }

        } else {
          console.log('response.result.metadata.intentName', response.result.metadata.intentName)
          switch (response.result.metadata.intentName) {
            case 'flight.search':
              console.log('inside flight')
              console.log('flight.search',response.result.parameters)

              var messageData = {
                "attachment": {
        "type": "template",
        "payload": {
          "template_type": "airline_boardingpass",
          "intro_message": "You are checked in.",
          "locale": "en_US",
          "boarding_pass": [
            {
              "passenger_name": "SMITH\/NICOLAS",
              "pnr_number": "CG4X7U",
              "seat": "74J",
              "logo_image_url": "https:\/\/www.example.com\/en\/logo.png",
              "header_image_url": "https:\/\/www.example.com\/en\/fb\/header.png",
              "qr_code": "M1SMITH\/NICOLAS  CG4X7U nawouehgawgnapwi3jfa0wfh",
              "above_bar_code_image_url": "https:\/\/www.example.com\/en\/PLAT.png",
              "auxiliary_fields": [
                {
                  "label": "Terminal",
                  "value": "T1"
                },
                {
                  "label": "Departure",
                  "value": "30OCT 19:05"
                }
              ],
              "secondary_fields": [
                {
                  "label": "Boarding",
                  "value": "18:30"
                },
                {
                  "label": "Gate",
                  "value": "D57"
                },
                {
                  "label": "Seat",
                  "value": "74J"
                },
                {
                  "label": "Sec.Nr.",
                  "value": "003"
                }
              ],
              "flight_info": {
                "flight_number": "KL0642",
                "departure_airport": {
                  "airport_code": "JFK",
                  "city": "New York",
                  "terminal": "T1",
                  "gate": "D57"
                },
                "arrival_airport": {
                  "airport_code": "AMS",
                  "city": "Amsterdam"
                },
                "flight_schedule": {
                  "departure_time": "2016-01-02T19:05",
                  "arrival_time": "2016-01-05T17:30"
                }
              }
            }
          ]
        }
      }
    }
              sendFBMessage(sender,messageData);

              break;

          }
        }

      }
    });

    apiaiRequest.on('error', (error) => console.error(error));
    apiaiRequest.end();
  }
  // else if (event.message.attachments && event.message.attachments[0].payload && event.message.attachments[0].payload.coordinates) {
  //
  // }

}

function processAccountLinking(event) {

  var sender = event.sender.id.toString();

  if (event.account_linking.status == 'linked') {
    sessionIds.delete(sender);
    firstNames.delete(sender);
    spIds.delete(sender);
    spTokens.delete(sender);
    location.delete(sender);
    queryText.delete(sender);

    spIds.set(sender, event.account_linking.authorization_code);

    var messageData = {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: "Login successful, Please select an option below to continue. ",
          buttons: [
            {
              type: "postback",
              title: "DFA Deals",
              payload: "SHOW_PUBLIC_DEALS"
            }
          ]
        }
      }
    };
    // sendFBMessage(sender, messageData);
    getStarted2(sender);
    // add in db as well
  } else {
    if (spIds.has(sender)) {
      spIds.delete(sender, event.account_linking.authorization_code);
    }
    // remove from  db as well
  }

}

function splitResponse(str) {
  if (str.length <= 320) {
    return [str];
  }

  return chunkString(str, 300);
}

function chunkString(s, len) {
  var curr = len,
    prev = 0;

  var output = [];

  while (s[curr]) {
    if (s[curr++] == ' ') {
      output.push(s.substring(prev, curr));
      prev = curr;
      curr += len;
    } else {
      var currReverse = curr;
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

function sendFBMessage(sender, messageData, callback) {
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
  }, (error, response, body) => {
    if (error) {
      console.log('Error sending message: ', error);
    } else if (response.body.error) {
      console.log('Error: ', response.body.error);
    }

    if (callback) {
      callback();
    }
  });
}

function sendFBSenderAction(sender, action, callback) {
  setTimeout(() => {
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
    }, (error, response, body) => {
      if (error) {
        console.log('Error sending action: ', error);
      } else if (response.body.error) {
        console.log('Error: ', response.body.error);
      }
      if (callback) {
        callback();
      }
    });
  }, 1000);
}

function loginSignup(sender) {

  var messageData = {
    attachment: {
      type: "template",
      payload: {
        template_type: "button",
        text: "Please login",
        buttons: [
          {
            "type": "account_link",
            "url": LOGIN_API + "login"
          }
          // , {
          //   "type": "web_url",
          //   "url": LOGIN_API + "signup?recipientId=" + utils.encrypt(sender),
          //   "title": "Sign-up",
          //   "webview_height_ratio": "full",
          //   "messenger_extensions": true
          // }
        ]
      }
    }
  };
  sendFBMessage(sender, messageData);
}

function getStarted(sender) {
  var WelcomeMessage;
  var messageData;

  checkSocialPerksLogin(sender, function() {
    console.log('sender', sender)
    console.log('spIds.get(sender)', spIds.get(sender))
    if (spIds.get(sender) == '574f2ce553cbb7350313533f') {
      messageData = {
        attachment: {
          type: "template",
          payload: {
            template_type: "generic",
            elements: [
              {
                title: "Dubai Future Accelerators",
                image_url: "https://s3-ap-southeast-1.amazonaws.com/tempviafone/bg_1.jpg",
                buttons: [
                  {
                    "type": "account_link",
                    "url": LOGIN_API + "login"
                  }
                  // , {
                  //   "type": "web_url",
                  //   "url": LOGIN_API + "signup?recipientId=" + utils.encrypt(sender),
                  //   "title": "Sign-up",
                  //   "webview_height_ratio": "full",
                  //   "messenger_extensions": true
                  // },
                  // {
                  //     type: "postback",
                  //     title: "Continue as guest",
                  //     payload: "GET_STARTED_2",
                  // }
                ]
              }
            ]
          }
        }
      };

      if (!firstNames.has(sender)) {
        bot.getUserProfile(sender, function(err, profile) {
          firstNames.set(sender, profile.first_name);
          WelcomeMessage = "Hi " + profile.first_name + ", Welcome to DFA Deals Chat-bot, where you can view available discounts nearby and redeem them at participating outlets. Enjoy! ;)";
          sendFBMessage(sender, {text: WelcomeMessage});
          sendFBMessage(sender, messageData);
        });
      } else {
        WelcomeMessage = "Hi " + firstNames.get(sender) + ", Welcome to DFA Deals Chat-bot, where you can view available discounts nearby and redeem them at participating outlets. Enjoy! ;)";
        sendFBMessage(sender, {text: WelcomeMessage});
        sendFBMessage(sender, messageData);
      }

    } else {
      messageData = {
        attachment: {
          type: "template",
          payload: {
            template_type: "generic",
            elements: [
              {
                title: "Dubai Future Accelerators",
                image_url: "https://s3-ap-southeast-1.amazonaws.com/tempviafone/bg_1.jpg",
                buttons: [
                  {
                    type: "postback",
                    title: "Rewards",
                    payload: "SHOW_PUBLIC_DEALS"
                  }
                ]
              }
            ]
          }
        }
      };
      if (!firstNames.has(sender)) {
        bot.getUserProfile(sender, function(err, profile) {
          firstNames.set(sender, profile.first_name);
          WelcomeMessage = "Hi " + profile.first_name + ", Welcome to DFA Deals Chat-bot, where you can view available discounts nearby and redeem them at participating outlets. Enjoy! ;)";
          sendFBMessage(sender, {text: WelcomeMessage});
          // getStarted2(sender);
          sendFBMessage(sender, messageData);
        });
      } else {
        WelcomeMessage = "Hi " + firstNames.get(sender) + ", Welcome to DFA Deals Chat-bot, where you can view available discounts nearby and redeem them at participating outlets. Enjoy! ;)";
        sendFBMessage(sender, {text: WelcomeMessage});
        // getStarted2(sender);
        sendFBMessage(sender, messageData);
      }

    }
  });

  // setTimeout(function() {
  //     sendFBSenderAction(sender, 'typing_on', function() {
  //         sendFBMessage(sender, {
  //             "attachment": {
  //                 "type": "video",
  //                 "payload": {
  //                     "url": "https://s3.ap-south-1.amazonaws.com/ym.via-fone.com/images/entry.mp4"
  //                 }
  //             }
  //         });
  //
  //         setTimeout(function() {
  //             sendFBSenderAction(sender, 'typing_off');
  //         }, 3000);
  //
  //     });
  // }, 800);
}

function getStarted2(sender) {
  setTimeout(function() {
    sendFBMessage(sender, {
      "text": "Let's get started?",
      "quick_replies": [
        {
          "content_type": "text",
          "title": "DFA Deals",
          "payload": "SHOW_PUBLIC_DEALS"
        },
        // {
        //   "content_type":"text",
        //   "title":"Events",
        //   "payload":"EVENTS"
        // },
        // {
        //   "content_type":"text",
        //   "title":"Outlets",
        //   "payload":"BRANDS"
        // }
      ]
    });
  }, 500);
}


function shuffle(array) {
  var currentIndex = array.length, temporaryValue, randomIndex;

  // While there remain elements to shuffle...
  while (0 !== currentIndex) {

    // Pick a remaining element...
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex -= 1;

    // And swap it with the current element.
    temporaryValue = array[currentIndex];
    array[currentIndex] = array[randomIndex];
    array[randomIndex] = temporaryValue;
  }

  return array;
}

/*
 * Postback Event
 *
 * This event is called when a postback is tapped on a Structured Message.
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/postback-received
 *
 */
function receivedPostback(event) {
  var sender = event.sender.id;
  var recipientID = event.recipient.id;
  var timeOfPostback = event.timestamp;

  // The 'payload' param is a developer-defined field which is set in a postback
  // button for Structured Messages.
  var payload = event.postback.payload;

  console.log("Received postback for user %d and page %d with payload '%s' " +
    "at %d",
  sender, recipientID, payload, timeOfPostback);

  // When a postback is called, we'll send a message back to the sender to
  // let them know it was successful

  var dataId = event.postback.payload.substring(event.postback.payload.indexOf('|') + 1);
  if (event.postback.payload.indexOf('|') > 0) {
    event.postback.payload = event.postback.payload.substring(0, event.postback.payload.indexOf('|'));
  }
  console.log('dataId', dataId)
  console.log('event.postback.payload', event.postback.payload)
  switch (event.postback.payload) {
    case 'GET_STARTED':
      getStarted(sender);
      break;
    case 'SHOW_PUBLIC_DEALS':
      checkSocialPerksLogin(sender, function() {
        if (spIds.get(sender) == '574f2ce553cbb7350313533f') {
          loginSignup(sender);
        } else {
            var client = new Client();
                          var args = {
                              data: {
                                  "language": "EN",
                                  "country": "AE"
                              },
                              headers: {
                                  "Content-Type": "application/json",
                                  "x-access-token": spTokens.get(sender),
                              }
                          };
                          console.log('spTokens.get(sender)', spTokens.get(sender))
                          client.post(API_URL + '/Campaign/GetElligibleCategories', args, function(data, response) {
                              if (response) {
                                  var mainCategories = Object.keys(data);
                                  mainCategories = mainCategories.filter(function(i) {
                                      return i != "custom"
                                  });
                                  var quick_replies = [];

                                  quick_replies.push({
                                      "content_type": "text",
                                      "title": 'All',
                                      "payload": "SHOW_PUBLIC_DEALS_1|All"
                                  });

                                  mainCategories.forEach(function(category) {
                                      quick_replies.push({
                                          "content_type": "text",
                                          "title": category,
                                          "payload": "SHOW_PUBLIC_DEALS_2|" + category
                                      });
                                  });
                                  setTimeout(function() {
                                      sendFBMessage(sender, {
                                          "text": "What's on your mind?",
                                          "quick_replies": quick_replies
                                      });
                                  }, 10);
                              }
                          });
          // old code
          // sendFBMessage(sender, {
          //   "text": "What’s on your mind?",
          //   "quick_replies": [
          //     {
          //       "content_type": "text",
          //       "title": "Food",
          //       "payload": "SHOW_PUBLIC_DEALS_1|Food"
          //     }
          //   ]
          // });
        }
      });
      break;

      case 'SHOW_PUBLIC_DEALS_2':
          checkSocialPerksLogin(sender, function() {
              console.log('spIds.get(sender)', spIds.get(sender))
              var client = new Client();

              var args = {
                  data: {
                      "language": "EN",
                      "country": "AE"
                  },
                  headers: {
                      "Content-Type": "application/json",
                      "x-access-token": spTokens.get(sender),
                  }
              };
              console.log('spTokens.get(sender)', spTokens.get(sender))
              client.post(API_URL + '/Campaign/GetElligibleCategories', args, function(data, response) {
                  if (response) {
                      var quick_replies = [];
                      console.log('dataId', dataId)
                      console.log('data', data)
                      console.log('data[dataId]', data[dataId])

                      var subCategories = data[dataId].slice(0, 9)
                      quick_replies.push({
                          "content_type": "text",
                          "title": "All",
                          "payload": "SHOW_PUBLIC_DEALS_1|" + dataId
                      });
                      subCategories.forEach(function(category) {
                          quick_replies.push({
                              "content_type": "text",
                              "title": category,
                              "payload": "SHOW_PUBLIC_DEALS_1|" + dataId + "." + category
                          });
                      });
                      setTimeout(function() {
                          sendFBMessage(sender, {
                              "text": "Wish to be more specific?",
                              "quick_replies": quick_replies
                          });
                      }, 10);

                  }

              });
          });

          break;
          case 'SHOW_PUBLIC_DEALS_1':
              checkSocialPerksLogin(sender, function() {
                  console.log('spIds.get(sender)', spIds.get(sender))
                  var client = new Client();

                  var args = {
                      data: {
                          "language": "EN",
                          "country": "AE"
                      },
                      headers: {
                          "Content-Type": "application/json",
                          "x-access-token": spTokens.get(sender),
                      }
                  };
                  console.log('spTokens.get(sender)', spTokens.get(sender))
                  client.post(API_URL + '/Campaign/GetMyElligibleCampaigns', args, function(data, response) {
                      data = data.campaigns;
                      // console.log(data);
                      var elements = [];
                      async.eachSeries(data, function(result, doneWithRole) {

                              var mainCategory;
                              if (dataId.indexOf('.') == -1) {
                                  mainCategory = dataId;
                              } else {
                                  mainCategory = dataId.substring(0, dataId.indexOf('.'));
                              }
                              console.log('mainCategory', mainCategory)
                              console.log('dataId', dataId)
                              console.log('1', result.categoryList[dataId.substring(0, dataId.indexOf('.'))])
                              console.log('2', dataId.substring(dataId.indexOf('.') + 1))
                              console.log('inside', _.indexOf(result.categoryList[dataId.substring(0, dataId.indexOf('.'))], dataId.substring(dataId.indexOf('.') + 1)))
                              if (!_.get(result, 'categoryList.' + mainCategory) && dataId != 'All') {
                                  doneWithRole();
                              } else if (dataId == 'All' || dataId.indexOf('.') == -1 || _.indexOf(result.categoryList[dataId.substring(0, dataId.indexOf('.'))], dataId.substring(dataId.indexOf('.') + 1)) > -1) {
                                  // console.log('result.redeemers', result.redeemers)
                                  var subTitle = result.redeemers[0].name;

                                  if (result.endDate != 'undefined' && result.endDate !='') {
                                    subTitle += ' | Expires on: ' + new Date(result.endDate).toLocaleDateString('en-GB', {
                                      day: 'numeric',
                                      month: 'short'
                                    }).split(' ').join(' ');
                                  }

                                  if (result.inventoryLeft > 0) {
                                    subTitle += ' | Left : ' + result.inventoryLeft;
                                  }
                                  var redeemButton = {
                                    type: "web_url",
                                    title: "Redeem Now",
                                    url: LOGIN_API + "pin?participate=true&clientName=" + utils.encrypt(result.redeemers[0].clientName) + "&outletName=" + utils.encrypt(result.redeemers[0].name) + "&campaignId=" + utils.encrypt(result._id) + "&recipientId=" + utils.encrypt(sender) + "&name=" + utils.encrypt(result.title) + "&userId=" + utils.encrypt(spIds.get(sender)),
                                    webview_height_ratio: "full",
                                    messenger_extensions: true
                                  };

                                  elements.push({
                                      title: subTitle,
                                      subtitle: result.title ,
                                      image_url: (result.image != 'undefined' && result.image != '') ? result.image : 'https://s3-ap-southeast-1.amazonaws.com/tempviafone/bg_1.jpg',
                                      buttons: [redeemButton,
                                         {
                                          type: "postback",
                                          title: "View Details",
                                          payload: "VIEW_CAMPAIGN_DETAILS|" + result._id,
                                      },{ type: "web_url",
                                          url: "https://www.google.com/maps/dir/" + result.redeemers[0].pos[0].latitude + "," + result.redeemers[0].pos[0].longitude,
                                          title: " Get Directions"
                                        }
                                    ]
                                  });

                                  doneWithRole()
                              } else {
                                  doneWithRole()
                              }
                          },
                          function(err) {
                              var client = new Client();

                              var args = {
                                  data: {
                                      "language": "EN",
                                      "country": "AE"
                                  },
                                  headers: {
                                      "Content-Type": "application/json",
                                      "x-access-token": spTokens.get(sender),
                                  }
                              };
                              client.post(API_URL + '/Campaign/GetMyRegularCoupons', args, function(data, response) {
                                  data = data.campaigns;
                                  // console.log('GetMyRegularCoupons', data);
                                  async.eachSeries(data, function(result, doneWithRole) {
                                          var mainCategory;

                                          if (dataId.indexOf('.') == -1) {
                                              mainCategory = dataId;
                                          } else {
                                              mainCategory = dataId.substring(0, dataId.indexOf('.'));
                                          }

                                          if (!_.get(result, 'categoryList.' + mainCategory) && dataId != 'All') {
                                              doneWithRole();
                                          } else if (dataId == 'All' || dataId.indexOf('.') == -1 || _.indexOf(result.categoryList[dataId.substring(0, dataId.indexOf('.'))], dataId.substring(dataId.indexOf('.') + 1)) > -1) {
                                              // console.log('result.redeemers', result.redeemers)
                                              var subTitle = result.redeemers[0].name;

                                              if (result.endDate != 'undefined' && result.endDate !='') {
                                                subTitle += ' | Expires on: ' + new Date(result.endDate).toLocaleDateString('en-GB', {
                                                  day: 'numeric',
                                                  month: 'short'
                                                }).split(' ').join(' ');
                                              }

                                              if (result.inventoryLeft > 0) {
                                                subTitle += ' | Left : ' + result.inventoryLeft;
                                              }
                                              var redeemButton = {
                                                type: "web_url",
                                                title: "Redeem Now",
                                                url: LOGIN_API + "pin?participate=true&clientName=" + utils.encrypt(result.redeemers[0].clientName) + "&outletName=" + utils.encrypt(result.redeemers[0].name) + "&campaignId=" + utils.encrypt(result._id) + "&recipientId=" + utils.encrypt(sender) + "&name=" + utils.encrypt(result.title) + "&userId=" + utils.encrypt(spIds.get(sender)),
                                                webview_height_ratio: "full",
                                                messenger_extensions: true
                                              };

                                              elements.push({
                                                  title: result.title,
                                                  subtitle: subTitle,
                                                  image_url: (result.image != 'undefined' && result.image != '') ? result.image : 'https://s3-ap-southeast-1.amazonaws.com/tempviafone/bg_1.jpg',
                                                  buttons: [redeemButton
                                                    , {
                                                      type: "postback",
                                                      title: "View Details",
                                                      payload: "VIEW_CAMPAIGN_DETAILS|" + result._id,
                                                  },{ type: "web_url",
                                                      url: "https://www.google.com/maps/dir/" + result.redeemers[0].pos[0].latitude + "," + result.redeemers[0].pos[0].longitude,
                                                      title: " Get Directions"
                                                    }]
                                              });
                                              doneWithRole()
                                          } else {
                                              doneWithRole()
                                          }

                                      },
                                      function(err) {
                                          // call after getting regularcoupons
                                          console.log('elements', elements)
                                          elements = shuffle(elements);

                                          var messageData = {
                                              attachment: {
                                                  type: "template",
                                                  payload: {
                                                      template_type: "generic",
                                                      elements: elements.slice(0, 9)
                                                  }
                                              }
                                          };
                                          console.log('messageData', messageData)
                                          if (elements.length > 0) {
                                              sendFBMessage(sender, {
                                                  text: 'Check out these great offers!'
                                              });

                                              sendFBMessage(sender, messageData);
                                          } else {
                                              sendFBMessage(sender, {
                                                  text: 'No perks found.'
                                              });
                                          }
                                      });
                              });
                              // callSendAPI(messageData);
                          });
                  });
              });
              break;
    case 'SHOW_PUBLIC_DEALS_0':
      checkSocialPerksLogin(sender, function() {
        console.log('spIds.get(sender)', spIds.get(sender))
        var client = new Client();

        var args = {
          data: {
            "language": "EN",
            "country": "AE"
          },
          headers: {
            "Content-Type": "application/json",
            "x-access-token": spTokens.get(sender)
          }
        };
        client.post(API_URL + '/Campaign/GetMyElligibleCampaigns', args, function(data, response) {
          console.log('data', data)
          data = data.campaigns;
          console.log('data', data)
          // console.log(data);
          var elements = [];
          async.eachSeries(data, function(result, doneWithRole) {
            console.log('result', result)
            if (!_.get(result, 'categoryList.' + dataId)) {
              doneWithRole();

            } else {
              // console.log('result.redeemers', result.redeemers)
              var subTitle = result.redeemers[0].name;

              if (result.endDate != 'undefined' && result.endDate !='') {
                subTitle += ' | Expires on: ' + new Date(result.endDate).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'short'
                }).split(' ').join(' ');
              }

              if (result.inventoryLeft > 0) {
                subTitle += ' | Left : ' + result.inventoryLeft;
              }
              var redeemButton = {
                type: "web_url",
                title: "Redeem Now",
                url: LOGIN_API + "pin?participate=true&clientName=" + utils.encrypt(result.redeemers[0].clientName) + "&outletName=" + utils.encrypt(result.redeemers[0].name) + "&campaignId=" + utils.encrypt(result._id) + "&recipientId=" + utils.encrypt(sender) + "&name=" + utils.encrypt(result.title) + "&userId=" + utils.encrypt(spIds.get(sender)),
                webview_height_ratio: "full",
                messenger_extensions: true
              };

              elements.push({
                title: result.title,
                subtitle: subTitle,
                image_url: result.image != 'undefined'
                  ? result.image
                  : 'https://s3-ap-southeast-1.amazonaws.com/tempviafone/bg_1.jpg',
                buttons: [
                  redeemButton,
                  //  {
                  //   "type": "element_share"
                  // },
                   {
                    type: "postback",
                    title: "View Details",
                    payload: "VIEW_CAMPAIGN_DETAILS|" + result._id
                  }
                ]
              });

              doneWithRole()
            }
          }, function(err) {

            var client = new Client();

            var args = {
              data: {
                "language": "EN",
                "country": "AE"
              },
              headers: {
                "Content-Type": "application/json",
                "x-access-token": spTokens.get(sender)
              }
            };
            client.post(API_URL + '/Campaign/GetMyRegularCoupons', args, function(data, response) {
              data = data.campaigns;

              // console.log('GetMyRegularCoupons', data);
              async.eachSeries(data, function(result, doneWithRole) {
                if (!_.get(result, 'categoryList.' + dataId)) {
                  doneWithRole();
                } else {

                  // console.log('result.redeemers', result.redeemers)
                  var subTitle = result.redeemers[0].name;
                  if (result.endDate != 'undefined' && result.endDate !='') {
                    subTitle += ' | Expires on: ' + new Date(result.endDate).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short'
                    }).split(' ').join(' ');
                  }

                  if (result.inventoryLeft > 0) {
                    subTitle += ' | Left : ' + result.inventoryLeft;
                  }
                  var redeemButton = {
                    type: "web_url",
                    title: "Redeem",
                    url: LOGIN_API + "pin?participate=false&clientName=" + utils.encrypt(result.redeemers[0].clientName) + "&outletName=" + utils.encrypt(result.redeemers[0].name) + "&campaignId=" + utils.encrypt(result._id) + "&recipientId=" + utils.encrypt(sender) + "&name=" + utils.encrypt(result.title) + "&userId=" + utils.encrypt(spIds.get(sender)),
                    webview_height_ratio: "full",
                    messenger_extensions: true
                  };
                  elements.push({
                    title: result.title,
                    subtitle: subTitle,
                    image_url: result.image != 'undefined'
                      ? result.image
                      : 'https://s3-ap-southeast-1.amazonaws.com/tempviafone/bg_1.jpg',
                    buttons: [
                      redeemButton,
                      //  {
                      //   "type": "element_share"
                      // },
                       {
                        type: "postback",
                        title: "View Details",
                        payload: "VIEW_CAMPAIGN_DETAILS|" + result._id
                      }
                    ]
                  });
                  doneWithRole()
                }
              }, function(err) {
                console.log('elements', elements)
                var messageData = {
                  attachment: {
                    type: "template",
                    payload: {
                      template_type: "generic",
                      elements: elements.slice(0, 9)
                    }
                  }
                };
                if (elements.length > 0) {
                  sendFBMessage(sender, messageData);
                } else {
                  sendFBMessage(sender, {text: 'No perks found'});
                }
              });
            });
            // callSendAPI(messageData);
          });
        });
      });
      break;
    case 'SNIP':
      checkSocialPerksLogin(sender, function() {
        if (spIds.get(sender) == '574f2ce553cbb7350313533f') {
          loginSignup(sender);
        } else {
          snipCoupon(sender, dataId, function(err) {
            if (err) {
              sendFBMessage(sender, {text: err[0]});
            } else {
              sendFBMessage(sender, {text: 'Perk Saved Successfully'});
            }
          });
        }
      });
      break;
    case 'REDEEM':
      checkSocialPerksLogin(sender, function() {
        if (spIds.get(sender) == '574f2ce553cbb7350313533f') {
          loginSignup(sender);
        } else {
          // var messageData = {
          //
          //     "attachment": {
          //         "type": "template",
          //         "payload": {
          //             "template_type": "button",
          //             "text" : "Cashier Login",
          //             "buttons": [{
          //                 "type": "web_url",
          //                 "url": "https://sp-fb-login-app.herokuapp.com/login",
          //                 "title": "Show Website",
          //                 "title": "Click here",
          //                 "webview_height_ratio": "compact"
          //             }]
          //         }
          //     }
          //
          // };
          //
          // sendFBMessage(sender, messageData);

          var messageData = {
            attachment: {
              type: "image",
              payload: {
                "url": "https://s3-ap-southeast-1.amazonaws.com/social-perks/Show+QR.png"
              }
            }
          };

          sendFBMessage(sender, messageData);
          sendFBMessage(sender, {text: 'Show QR to waiter'});
        }
      });
    case "SHOW_SAVED_PERKS":
      checkSocialPerksLogin(sender, function() {
        if (spIds.get(sender) == '574f2ce553cbb7350313533f') {
          loginSignup(sender);
          return;
        }
        var client = new Client();
        var args = {
          data: {
            "language": "EN",
            "country": "AE"
          },
          headers: {
            "Content-Type": "application/json",
            "x-access-token": spTokens.get(sender)
          }
        };
        console.log('args', args)
        client.post(API_URL + '/Campaign/GetMySnippedCoupons', args, function(data, response) {
          data = data.campaigns;

          console.log(data);
          var elements = [];
          async.eachSeries(data, function(result, doneWithRole) {
            console.log('result.redeemers', result.redeemers)
            var subTitle = 'Outlet: ' + result.redeemers[0].name;
            console.log('result.reward.expiryDate', result.reward[0].expiryDate)
            if (result.reward[0].expiryDate) {
              var dateDiff = new Date(new Date().getTime() - new Date(result.reward[0].expiryDate).getTime());
              if ((dateDiff.getUTCDate() - 1) == 1) {
                subTitle += ' | Expiry: Today';
              } else {
                subTitle += ' | Expiry: ' + (dateDiff.getUTCDate() - 1) + ' Days';
              }
            }

            if (result.score) {
              subTitle += ' | Rating : ' + result.score;
            }

            var redeemButton;
            redeemButton = {
              type: "web_url",
              title: "Redeem",
              url: LOGIN_API + "pin?clientName=" + utils.encrypt(result.redeemers[0].clientName) + "&outletName=" + utils.encrypt(result.redeemers[0].name) + "&campaignId=" + utils.encrypt(result._id) + "&recipientId=" + utils.encrypt(sender) + "&name=" + utils.encrypt(result.title) + "&userId=" + utils.encrypt(spIds.get(sender)),
              webview_height_ratio: "full",
              messenger_extensions: true
            };
            //     type: "web_url",
            //     url: "https://www.google.com/maps/dir/" + result.redeemers[0].pos[0].latitude + "," + result.redeemers[0].pos[0].longitude,
            //     title: " Get Directions"
            elements.push({
              title: result.title,
              subtitle: subTitle,
              image_url: result.image != 'undefined'
                ? result.image
                : 'https://s3-ap-southeast-1.amazonaws.com/tempviafone/bg_1.jpg',
              buttons: [
                redeemButton,
                // {
                //   "type": "element_share"
                // },
                {
                  type: "postback",
                  title: "View Details",
                  payload: "VIEW_CAMPAIGN_DETAILS|" + result._id
                }
              ]
            });

            doneWithRole()
          }, function(err) {
            console.log('elements', elements)
            if (elements.length > 0) {
              var messageData = {
                attachment: {
                  type: "template",
                  payload: {
                    template_type: "generic",
                    elements: elements.slice(0, 9)
                  }
                }
              };
              sendFBMessage(sender, messageData);
            } else {
              sendFBMessage(sender, {text: 'You have not saved any perk yet. Find and saved your perks now!'});
            }
            // callSendAPI(messageData);
          });
        });
      });
      break;
      // case "LOGOUT":
      // if (spIds.has(sender)) {
      //     spIds.delete(sender, event.account_linking.authorization_code);
      // }
      // getStarted(sender);
      // break;
    case "SHOW_PUBLIC_DEALS_NEARBY":
      checkSocialPerksLogin(sender, function() {
    if (spIds.get(sender) == '574f2ce553cbb7350313533f') {
      loginSignup(sender);
    } else {
      location.set(sender, 'SHOW_PUBLIC_DEALS_NEARBY');
      sendFBMessage(sender, {
        text: 'Please share your location:',
        quick_replies: [
          {
            content_type: 'location'
          }
        ]
      });
}
})
      break;
    case "HISTORY":
      checkSocialPerksLogin(sender, function() {
        if (spIds.get(sender) == '574f2ce553cbb7350313533f') {
          loginSignup(sender);
          return;
        }
        var client = new Client();
        var args = {
          data: {
            "language": "EN",
            "country": "AE"
          },
          headers: {
            "Content-Type": "application/json",
            "x-access-token": spTokens.get(sender)
          }
        };
        client.post(API_URL + '/Transaction/History', args, function(data, response) {
          console.log(data);
          if (!data.errors) {
            var elements = [];
            data.sort(function(a, b) {
              // Turn your strings into dates, and then subtract them
              // to get a value that is either negative, positive, or zero.
              return new Date(b.date) - new Date(a.date);
            });

elements.push({
title:'Transaction History',
subtitle: 'Recent Transactions'
});
            async.eachSeries(data, function(result, doneWithRole) {
              console.log('result', result)
              if (result._id) {
                elements.push({
                  title: result.business_unit,
                  subtitle: new Date(result.date).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: 'numeric'
                  }).split(' ').join(' '),
                  // image_url: 'https://d13mc760e5f146.cloudfront.net/app/img/logos/' + result.usedVouchers[0].client + 'POS',
                  buttons: [
                    {
                      type: "postback",
                      title: "View Details",
                      payload: "VIEW_TRANSACTION_DETAILS|" + result._id
                    }
                  ]
                });
                doneWithRole()
              } else {
                doneWithRole()
              }
            }, function(err) {
              if (elements.length > 0) {
                console.log('elements.slice(0, 4)', elements.slice(0, 4))
                var messageData = {
                  attachment: {
                    type: "template",
                    payload: {
                      template_type: "list",
                      "top_element_style": "compact",
                      elements: elements.slice(0, 4)

                    }
                  }
                };
                sendFBMessage(sender, messageData);
              } else {
                sendFBMessage(sender, {text: 'No transactions found'});
              }
              // callSendAPI(messageData);
            });
          }
        });
      });
      break;
    case "VIEW_TRANSACTION_DETAILS":
      checkSocialPerksLogin(sender, function() {
        if (spIds.get(sender) == '574f2ce553cbb7350313533f') {
          loginSignup(sender);
        } else {
          transactionDetails(sender, dataId, function(err, message) {
            if (message) {
              sendFBMessage(sender, message);
            } else {
              sendFBMessage(sender, {text: 'Transaction details not found.'});
            }
          });
        }
      });
      break;
    case "VIEW_CAMPAIGN_DETAILS":
      checkSocialPerksLogin(sender, function() {
        campaignDetails(sender, dataId, function(err, message) {
          if (message) {
            sendFBMessage(sender, message);
          } else {
            sendFBMessage(sender, {text: 'Transaction details not found.'});
          }
        });
      });
      break;
    case "EVENTS":
      var messageData = {
        attachment: {
          type: "template",
          payload: {
            template_type: "generic",
            elements: [
              {
                title: 'Be Discovered: Model Casting',
                subtitle: '15 February-11 March 2017',
                image_url: 'http://yasmall.ae/uploads/site1/Events/img4689640x480engmobile.jpg',
                buttons: [
                  {
                    type: "web_url",
                    title: "View Details",
                    url: "http://yasmall.ae/EventDetails.aspx?Id=3098"
                  }
                  // ,{
                  //   "type": "element_share"
                  // }
                ]
              }, {
                title: 'Chinese New Year',
                subtitle: '25 January-28 January 2017',
                image_url: 'http://yasmall.ae/uploads/site1/Events/img25096140_Aldar_YasMaLL_ChineseNY_640x500.jpg',
                buttons: [
                  {
                    type: "web_url",
                    title: "View Details",
                    url: "http://yasmall.ae/EventDetails.aspx?Id=3097"
                  }
                  // , {
                  //   "type": "element_share"
                  // }
                ]
              }
            ]
          }
        }
      };
      sendFBMessage(sender, messageData);
      setTimeout(function() {
        getStarted2(sender)
      }, 500);

      break;
    case "BRANDS":
      sendFBMessage(sender, {
        "attachment": {
          "type": "template",
          "payload": {
            "template_type": "button",
            "text": "Please select an option below",
            "buttons": [
              {
                "type": "web_url",
                "url": "https://s3.ap-south-1.amazonaws.com/ym.via-fone.com/brands_list.html",
                "title": "Click here to see shops",
                "webview_height_ratio": "full"
              }
            ]
          }
        }
      });
      break;
    case "SEARCH":
      sendFBMessage(sender, {text: 'Please enter your search keyword?'});
      queryText.set(sender, 'SEARCH');
      break;
    case "MAKE_PURCHASE":
      checkSocialPerksLogin(sender, function() {
        if (spIds.get(sender) == '574f2ce553cbb7350313533f') {
          loginSignup(sender);
        } else {
          sendFBMessage(sender, {
            "attachment": {
              "type": "template",
              "payload": {
                "template_type": "button",
                "text": "Please select an option below",
                "buttons": [
                  {
                    "type": "web_url",
                    "url": LOGIN_API + "pin?participate=true&clientName=" + utils.encrypt('Jumeirah') + "&outletName=&campaignId=&name=&recipientId=" + utils.encrypt(sender) + "&userId=" + utils.encrypt(spIds.get(sender)),
                    "title": "Click here to earn",
                    "webview_height_ratio": "full"
                  }
                ]
              }
            }
          });
        }
      });
      break;
    case "POINTS":
      checkSocialPerksLogin(sender, function() {
        if (spIds.get(sender) == '574f2ce553cbb7350313533f') {
          loginSignup(sender);
        } else {

          var client = new Client();
          var args = {
            data: {
              "language": "EN",
              "country": "AE",
              "clientName": "Jumeirah"
            },
            headers: {
              "Content-Type": "application/json",
              "x-access-token": spTokens.get(sender)
            }
          };
          console.log('args', args)
          client.post(API_URL + '/Customer/Wallets', args, function(data, response) {
            console.log(data);
            var elements = [];

            async.eachSeries(data, function(result, doneWithRole) {
              elements.push({
                title: result.storeCard.headerFields[0].value + " Points = " + result.storeCard.headerFields[0].value * result.redeemRatio.AED + " AED",
                subtitle: "Status: " + result.storeCard.auxiliaryFields[0].value,
                image_url: "https://s3-ap-southeast-1.amazonaws.com/tempviafone/card.jpg"
              });

              doneWithRole()
            }, function(err) {
              console.log('elements', elements)
              if (elements.length > 0) {
                var messageData = {
                  attachment: {
                    type: "template",
                    payload: {
                      template_type: "generic",
                      elements: elements.slice(0, 9)
                    }
                  }
                };
                sendFBMessage(sender, messageData);
              } else {
                // sendFBMessage(sender, {
                //     text: 'You have not saved any perk yet. Find and saved your perks now!'
                // });
              }
              // callSendAPI(messageData);
            });
          });
        }
      });
      break;
    case "GET_STARTED_2":
      getStarted2(sender);
      break;
    default:

  }
}

function doSubscribeRequest() {
  request({
    method: 'POST',
    uri: "https://graph.facebook.com/v2.6/me/subscribed_apps?access_token=" + FB_PAGE_ACCESS_TOKEN
  }, (error, response, body) => {
    if (error) {
      console.error('Error while subscription: ', error);
    } else {
      console.log('Subscription result: ', response.body);
    }
  });
}

function isDefined(obj) {
  if (typeof obj == 'undefined') {
    return false;
  }

  if (!obj) {
    return false;
  }

  return obj != null;
}

const app = express();

app.use(bodyParser.text({type: 'application/json'}));

app.get('/webhook/', (req, res) => {
  if (req.query['hub.verify_token'] == FB_VERIFY_TOKEN) {
    res.send(req.query['hub.challenge']);

    setTimeout(() => {
      doSubscribeRequest();
    }, 3000);
  } else {
    res.send('Error, wrong validation token');
  }
});

app.post('/notify/', (req, res) => {
  try {
    var data = JSONbig.parse(req.body);
    console.log('data', data)
    if (data.recipientId && data.type) {
      if (data.type == 'signup' && data._id) {
        data.recipientId = data.recipientId.toString();
        sessionIds.delete(data.recipientId);
        firstNames.delete(data.recipientId);
        spIds.delete(data.recipientId);
        spTokens.delete(data.recipientId);
        location.delete(data.recipientId);
        queryText.delete(data.recipientId);

        spIds.set(data.recipientId, data._id);

        var messageData = {
          attachment: {
            type: "template",
            payload: {
              template_type: "generic",
              elements: [
                {
                  title: "Social Perks",
                  image_url: "https://s3-ap-southeast-1.amazonaws.com/tempviafone/bg_1.jpg",
                  buttons: [
                    {
                      type: "postback",
                      title: "Rewards",
                      payload: "SHOW_PUBLIC_DEALS"
                    }
                  ]
                }
              ]
            }
          }
        };
        bot.getUserProfile(data.recipientId, function(err, profile) {
          var WelcomeMessage = "Hi " + profile.first_name + ", Congrats! You're singed-up successfully.Simply use the menu below or tell us what you're wishing for. Enjoy! ;)";
          sendFBMessage(data.recipientId, {text: WelcomeMessage});
          // sendFBMessage(data.recipientId, messageData);
          getStarted2(data.recipientId);
        });

      } else if (data.type == 'transaction' && data._id) {
        sendFBMessage(data.recipientId, {text: 'Your voucher has been redeemed!'});
        transactionDetails(data.recipientId, data._id, function(err, message) {
          if (message) {
            sendFBMessage(data.recipientId, message);
          } else {
            sendFBMessage(data.recipientId, {text: 'Transaction details not found.'});
          }
        });

      }
    }
  } catch (err) {
    return res.status(400).json({status: "error", error: err});
  }

});

app.post('/webhook/', (req, res) => {
  try {
    var data = JSONbig.parse(req.body);
    console.log('data', data)
    if (data.entry) {
      let entries = data.entry;
      entries.forEach((entry) => {
        let messaging_events = entry.messaging;
        if (messaging_events) {
          messaging_events.forEach((event) => {
            console.log('event', event)
            if (event.message && !event.message.is_echo || event.postback && event.postback.payload) {
              processEvent(event);
            } else if (event.account_linking) {
              processAccountLinking(event);
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

app.listen(REST_PORT, () => {
  console.log('Rest service ready on port ' + REST_PORT);
});

doSubscribeRequest();

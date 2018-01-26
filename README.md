# api-ai-facebook
Facebook bot sources for Api.ai integration

## Deploy with Heroku
Follow [these instructions](https://docs.api.ai/docs/facebook-integration#hosting-fb-messenger-bot-with-heroku).
Then,  
[![Deploy to Heroku](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy)

## Deploy with Docker

## Testing

```bash
docker run -it --name fb_bot \
           -p <your_desired_port>:5000 \
           -e APIAI_ACCESS_TOKEN=" " \
           -e FB_PAGE_ACCESS_TOKEN=" " \
           -e FB_VERIFY_TOKEN="emirates-ta" \
           -e APIAI_LANG="en" \
           xvir/api-ai-facebook
```

docker run -it --name fb_bot -p 5000:5000 -e APIAI_ACCESS_TOKEN="28866a2e57374dbe9df1363ece463d82" -e FB_PAGE_ACCESS_TOKEN="EAACDcONKDisBAJFqfdxo60naEVFZCWMn1vUT6hCuMYX0BEaW4vNCS9sU0x6jyxOTj60oiGRGGzNNDTItcY2EQlf93tpdYrZBzFK5mHmBGKYdzYZCRntvg0bIg4sPRWgLiNkJO2nCvQoNc7jZBUaN27Y3pBMpTvjCJzZBuxlxEJAZDZD" -e FB_VERIFY_TOKEN="emirates-ta" -e APIAI_LANG="en"  xvir/api-ai-facebook

## Note about languages:
When you deploy the app manually to Heroku, the APIAI_LANG not filled with a value.
You need to provide language parameter according to your agent settings in the form of two-letters code.

 * "en"
 * "ru"
 * "de"
 * "pt"
 * "pt-BR"
 * "es"
 * "fr"
 * "it"
 * "ja"
 * "ko"
 * "zh-CN"
 * "zh-HK"
 * "zh-TW"

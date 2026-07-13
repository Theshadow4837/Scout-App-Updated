#!/bin/bash



cd ~/Scout-App-Updated/Clasue-scout-app

if [ -f "deploy.lock" ]; then
echo "Already Deploying"
exit 0
fi

touch deploy.lock

echo "---DEPLOYING--- $(date)"


git pull origin main

npm install

echo "---BUILDING---"
npm run build

pm2 describe $Name > /dev/null 2>&1
if [ $? -eq 0 ]; then
echo "---RESTARTING---"
pm2 restart Scout-App
else
echo "---STARTING---"
pm2 start ~/Scout-App-Updated/Clasue-scout-app/server.cjs --name "Scout-App"
fi


rm deploy.lock

echo "---FINISHED---" >> deploy.log
#!/usr/bin/env bash

CURRENT_SHA="$(git log --pretty=format:'%H' -n 1)"
RELEASE="$(date +%Y-%m-%d-%H-%M)"

if [[ -n $(git status --porcelain) ]]; then
  echo "Repo is dirty, you silly! Aborting."
  exit 1
fi

echo "Deploying version $RELEASE ($CURRENT_SHA)..."

sed -i -e "s/%GIT_COMMIT%/$CURRENT_SHA/g" index.html
git checkout -B gh-pages
git commit -am "Release $RELEASE"
git push -f origin gh-pages
git checkout master

echo "Deployment successful!"

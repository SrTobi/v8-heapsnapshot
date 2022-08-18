# syntax = docker/dockerfile:1.2
FROM ubuntu:20.04

ENV TZ=Europe/Berlin
ENV DEBIAN_FRONTEND noninteractive

WORKDIR /root

RUN apt update
RUN apt install -y wget git zsh vim curl sudo build-essential

# setup other apt repos
# yarn
RUN curl -sS https://dl.yarnpkg.com/debian/pubkey.gpg | apt-key add -
RUN echo "deb https://dl.yarnpkg.com/debian/ stable main" | tee /etc/apt/sources.list.d/yarn.list
# sbt
RUN echo "deb https://repo.scala-sbt.org/scalasbt/debian all main" | sudo tee /etc/apt/sources.list.d/sbt.list
RUN echo "deb https://repo.scala-sbt.org/scalasbt/debian /" | sudo tee /etc/apt/sources.list.d/sbt_old.list
RUN curl -sL "https://keyserver.ubuntu.com/pks/lookup?op=get&search=0x2EE0EA64E40A89B84B2DF73499E82A75642AC823" | \
    sudo -H gpg --no-default-keyring --keyring gnupg-ring:/etc/apt/trusted.gpg.d/scalasbt-release.gpg --import
RUN sudo chmod 644 /etc/apt/trusted.gpg.d/scalasbt-release.gpg

RUN apt-get update
RUN apt-get install -y nodejs yarn
RUN yarn global add n
RUN $(yarn global bin)/n latest
RUN yarn global add typescript

# install python
#RUN apt install -y python3.10-full

# setup sudo
RUN echo '%sudo ALL=(ALL) NOPASSWD:ALL' >> /etc/sudoers

# Create user
RUN useradd -rm -d /home/ddev -s /bin/zsh -g users -G users,sudo ddev
USER ddev
WORKDIR /home/ddev

# add gitconfig
ADD content/gitconfig .gitconfig

# setup oh-my-zsh
RUN sh -c "$(wget -O- https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended
ADD content/zshrc .zshrc
ADD content/docker.zsh-theme .oh-my-zsh/themes/docker.zsh-theme

CMD [ "zsh" ]

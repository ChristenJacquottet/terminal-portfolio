# [WebShell | Terminal Portfolio Website](https://webshellx.vercel.app/)

<div align="center">
  <img alt="banner" src="https://raw.githubusercontent.com/nasan016/webshell/main/res/banner.png">
</div>

![Vercel](https://img.shields.io/badge/vercel-%23000000.svg?style=for-the-badge&logo=vercel&logoColor=white)
![Vite](https://img.shields.io/badge/vite-%23646CFF.svg?style=for-the-badge&logo=vite&logoColor=white)
![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white)
![HTML5](https://img.shields.io/badge/html5-%23E34F26.svg?style=for-the-badge&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/css3-%231572B6.svg?style=for-the-badge&logo=css3&logoColor=white)

Create your own terminal styled website! Check out [term.nasan.dev](https://term.nasan.dev/) for an example.

## Features
* **[Tab]** for auto completion.
* **[Esc]** to clear the input line.
* **[↑][↓]** to scroll through your command history.

## Configuration

Most of the configuration is done in the `config.json` file.

```json
{
  "ascii": [
    " ██████╗██╗  ██╗██████╗ ██╗███████╗████████╗███████╗███╗   ██╗",
    "██╔════╝██║  ██║██╔══██╗██║██╔════╝╚══██╔══╝██╔════╝████╗  ██║",
    "██║     ███████║██████╔╝██║███████╗   ██║   █████╗  ██╔██╗ ██║",
    "██║     ██╔══██║██╔══██╗██║╚════██║   ██║   ██╔══╝  ██║╚██╗██║",
    "╚██████╗██║  ██║██║  ██║██║███████║   ██║   ███████╗██║ ╚████║",
    " ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝╚══════╝   ╚═╝   ╚══════╝╚═╝  ╚═══╝",
    "                                                              "
  ],
  "title": "christen's terminal",
  "username": "visitor",
  "hostname": "chris.dev",
  "password": "050823",
  "repoLink": "https://github.com/christenjacquottet/terminal-portfolio",
  "social": {
    "email": "info@christenjacquottet.com",
    "github": "christenjacquottet",
    "linkedin": "christenjacquottet"
  },
  "aboutGreeting": "Hi I'm Christen. I'm an autodidactic technologist who enjoys problem solving.",
  "projects": [
    [
      "ARTIE GPT",
      "Artificially intelligent bartender.",
      "https://insider.lermaagency.com/chad-gpt/"
    ],
    [
      "DIGIMODEL",
      "Interoperable branded avatars.",
      "https://lermaagency.com/digimodel/"
    ]
  ],
  "colors": {
   ...
  }
}
```

## Run the Project Locally:

Clone the repository
```shell
git clone https://github.com/ChristenJacquottet/terminal-portfolio.git
```
Go to the project directory
```shell
cd webshell
```
Install the dependencies
```shell
npm install
```
Start the server
```shell
npm run dev
```

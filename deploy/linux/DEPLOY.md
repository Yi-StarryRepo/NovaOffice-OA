# NovaOffice OA Linux 部署文档

本文档基于当前项目的实际交付方式整理，适用于将 NovaOffice OA 部署到一台空白 Linux 服务器。

当前推荐的生产交付方式：

- 前端：`dist/` 静态资源
- 后端：`bin/novaoffice-oa` Go 可执行文件
- 数据库：`MariaDB / MySQL`
- 反向代理：`Nginx`

## 1. 部署目标

部署完成后，系统结构如下：

- 应用目录：`/opt/novaoffice-oa`
- 后端端口：`127.0.0.1:3000`
- Web 入口：`http://服务器IP/`
- 健康检查：`http://服务器IP/api/health`

默认管理员账号：

- 邮箱：`admin@novaoffice.com`
- 密码：`123456`

建议首次登录后立即修改默认密码。

## 2. 部署包

仓库中已提供部署包：

- `novaoffice-oa-deploy.tar.gz`

部署包中包含：

- `bin/novaoffice-oa`
- `dist/`
- `deploy/linux/`
- `.env.example`

## 3. 编译方式

当前推荐两种交付方式：

1. 本地编译后上传部署包
2. 直接上传源码，在服务器上编译

如果目标服务器是空白环境，推荐优先使用第一种方式，因为这样可以减少服务器上对 Node.js 和 Go 编译环境的依赖。

### 3.1 本地编译前端

在项目根目录执行：

```bash
npm install
npm run typecheck
npm run build
```

编译完成后会生成：

- `dist/`

### 3.2 本地编译 Linux 版 Go 后端

如果本地是 Linux / macOS：

```bash
cd backend-go
GOOS=linux GOARCH=amd64 go build -o ../bin/novaoffice-oa .
```

如果本地是 Windows PowerShell：

```powershell
cd backend-go
$env:GOOS='linux'
$env:GOARCH='amd64'
go build -o ..\bin\novaoffice-oa .
```

编译完成后会生成：

- `bin/novaoffice-oa`

### 3.3 打包上传

本地完成编译后，至少需要上传以下内容：

- `bin/novaoffice-oa`
- `dist/`
- `deploy/linux/`
- `.env.example`

如果直接使用仓库中已有的部署包，则上传：

- `novaoffice-oa-deploy.tar.gz`

### 3.4 在服务器上源码编译

如果你不想上传现成部署包，也可以把源码传到服务器后再编译。

这种方式需要服务器额外安装：

- Node.js
- npm
- Go

前端编译：

```bash
cd /opt/novaoffice-oa
npm install
npm run typecheck
npm run build
```

后端编译：

```bash
cd /opt/novaoffice-oa/backend-go
go build -o ../bin/novaoffice-oa .
```

编译完成后，后续部署步骤与部署包方式一致。

## 4. 部署前准备

本文档默认：

- 服务器为 Linux
- 使用 `systemd`
- 以 `root` 用户执行部署命令
- 部署包已上传到：

```text
/root/novaoffice-oa-deploy.tar.gz
```

## 5. 安装基础依赖

### 5.1 Ubuntu / Debian

```bash
apt-get update
apt-get install -y mariadb-server nginx curl
```

### 4.2 CentOS / Rocky / AlmaLinux

```bash
dnf -y install mariadb-server nginx curl
```

## 6. 创建应用目录

```bash
id -u novaoffice >/dev/null 2>&1 || useradd --system --create-home --home-dir /opt/novaoffice-oa novaoffice
mkdir -p /opt/novaoffice-oa
```

## 7. 解压部署包

```bash
tar -xzf /root/novaoffice-oa-deploy.tar.gz -C /opt/novaoffice-oa --strip-components=1
chown -R novaoffice:novaoffice /opt/novaoffice-oa
chmod +x /opt/novaoffice-oa/bin/novaoffice-oa
```

如果你采用的是“服务器源码编译”方式，而不是上传部署包，则确保以下目录已经存在：

- `backend-go/`
- `bin/`
- `dist/`
- `deploy/linux/`

## 8. 启动数据库

```bash
systemctl enable mariadb
systemctl restart mariadb
systemctl status mariadb --no-pager
```

如果 MariaDB 尚未初始化，再执行：

```bash
mkdir -p /var/lib/mysql
chown -R mysql:mysql /var/lib/mysql
mysql_install_db --user=mysql --skip-test-db --basedir=/usr --datadir=/var/lib/mysql
systemctl restart mariadb
```

## 9. 创建数据库和应用账号

```bash
mysql -uroot <<'SQL'
CREATE DATABASE IF NOT EXISTS novaoffice_oa DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'novaoffice'@'127.0.0.1' IDENTIFIED BY 'NovaOA@2026!DbLocal';
CREATE USER IF NOT EXISTS 'novaoffice'@'localhost' IDENTIFIED BY 'NovaOA@2026!DbLocal';
GRANT ALL PRIVILEGES ON novaoffice_oa.* TO 'novaoffice'@'127.0.0.1';
GRANT ALL PRIVILEGES ON novaoffice_oa.* TO 'novaoffice'@'localhost';
FLUSH PRIVILEGES;
SQL
```

## 10. 导入初始化数据

```bash
mysql -uroot novaoffice_oa < /opt/novaoffice-oa/deploy/linux/mysql/novaoffice_oa.sql
```

可通过以下命令确认默认管理员已导入：

```bash
mysql -uroot -D novaoffice_oa -e "select id,name,email,password from users;"
```

注意：默认登录账号是完整邮箱：

```text
admin@novaoffice.com
```

不是：

```text
admin@novaoffice
```

## 11. 配置生产环境变量

创建：

```text
/opt/novaoffice-oa/.env.production
```

内容如下：

```bash
cat > /opt/novaoffice-oa/.env.production <<'EOF'
PORT=3000
DB_DRIVER=mysql
MYSQL_DSN=novaoffice:NovaOA@2026!DbLocal@tcp(127.0.0.1:3306)/novaoffice_oa?charset=utf8mb4&parseTime=true&loc=Local
EOF
```

设置权限：

```bash
chown novaoffice:novaoffice /opt/novaoffice-oa/.env.production
chmod 640 /opt/novaoffice-oa/.env.production
```

## 12. 安装并启动后端服务

```bash
cp /opt/novaoffice-oa/deploy/linux/systemd/novaoffice-oa.service /etc/systemd/system/novaoffice-oa.service
systemctl daemon-reload
systemctl enable novaoffice-oa
systemctl restart novaoffice-oa
systemctl status novaoffice-oa --no-pager
```

## 13. 验证后端服务

### 13.1 健康检查

```bash
curl http://127.0.0.1:3000/api/health
```

正常会返回类似 JSON：

```json
{"database":"mysql","driver":"mysql","status":"up","version":"3.0.0-go"}
```

### 13.2 登录接口检查

```bash
curl -X POST http://127.0.0.1:3000/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@novaoffice.com","password":"123456"}'
```

如果能返回用户 JSON，说明：

- 后端正常
- 数据库正常
- 默认账号可用

## 14. 配置 Nginx

复制项目自带配置：

```bash
mkdir -p /etc/nginx/conf.d
cp /opt/novaoffice-oa/deploy/linux/nginx/novaoffice-oa.conf /etc/nginx/conf.d/novaoffice-oa.conf
```

配置内容应为：

```nginx
server {
    listen 80;
    server_name _;

    client_max_body_size 20m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 15. 删除 Nginx 默认站点

如果浏览器访问后看到：

```text
Welcome to nginx!
```

说明默认站点仍在生效，需要删除默认配置。

Ubuntu / Debian 常见处理方式：

```bash
rm -f /etc/nginx/sites-enabled/default
```

然后检查主配置是否包含：

```nginx
include /etc/nginx/conf.d/*.conf;
```

## 16. 启动 Nginx

```bash
nginx -t
systemctl enable nginx
systemctl restart nginx
systemctl status nginx --no-pager
```

## 17. 验证 Nginx 代理

### 17.1 本机验证

```bash
curl http://127.0.0.1/api/health
```

如果这里返回 JSON，而不是 404 或 Nginx 欢迎页，说明代理已经接通。

### 17.2 浏览器验证

浏览器访问：

```text
http://服务器IP/
```

正常应进入系统登录页。

## 18. 放行防火墙

### 18.1 `ufw`

```bash
ufw allow 80/tcp
```

### 18.2 `firewalld`

```bash
firewall-cmd --permanent --add-service=http
firewall-cmd --reload
```

## 19. 首次登录

浏览器访问：

```text
http://服务器IP/
```

使用以下账号登录：

- 邮箱：`admin@novaoffice.com`
- 密码：`123456`

## 20. 常用运维命令

查看服务状态：

```bash
systemctl status novaoffice-oa --no-pager
systemctl status nginx --no-pager
systemctl status mariadb --no-pager
```

重启服务：

```bash
systemctl restart novaoffice-oa
systemctl restart nginx
systemctl restart mariadb
```

查看日志：

```bash
journalctl -u novaoffice-oa -n 100 --no-pager
journalctl -u nginx -n 100 --no-pager
journalctl -u mariadb -n 100 --no-pager
```

## 21. 排障顺序

如果部署后访问异常，建议按以下顺序排查：

### 21.1 检查后端服务是否启动

```bash
systemctl status novaoffice-oa --no-pager
```

### 21.2 检查后端健康接口

```bash
curl http://127.0.0.1:3000/api/health
```

### 21.3 检查登录接口

```bash
curl -X POST http://127.0.0.1:3000/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@novaoffice.com","password":"123456"}'
```

### 21.4 检查 Nginx 代理

```bash
curl http://127.0.0.1/api/health
```

### 21.5 检查默认管理员是否存在

```bash
mysql -uroot -D novaoffice_oa -e "select email,password from users;"
```

### 21.6 检查 Nginx 是否仍加载默认站点

```bash
nginx -t
ls -l /etc/nginx/conf.d
ls -l /etc/nginx/sites-enabled
```

## 22. 常见问题

### 22.1 打开首页看到 `Welcome to nginx!`

原因：

- Nginx 默认站点仍在生效

处理：

- 删除默认站点
- 重启 Nginx

### 22.2 登录失败

优先检查：

- 账号是否写成了 `admin@novaoffice.com`
- 初始化 SQL 是否已导入
- 登录接口是否能在本机通过

### 22.3 后端健康检查正常，但首页打不开

优先检查：

- Nginx 配置是否正确复制
- `nginx -t` 是否通过
- 80 端口是否已放行

## 23. 上线后建议

部署完成后建议立即执行：

1. 修改默认管理员密码
2. 修改数据库密码
3. 执行 `mysql_secure_installation`
4. 配置 HTTPS
5. 配置备份、日志轮转和监控

package main

import (
	"bufio"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	_ "github.com/go-sql-driver/mysql"
)

func getenv(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}

func resolveSQLFile() (string, error) {
	if value := strings.TrimSpace(os.Getenv("MYSQL_SQL_FILE")); value != "" {
		return value, nil
	}

	cwd, err := os.Getwd()
	if err != nil {
		return "", err
	}

	candidates := []string{
		filepath.Join(cwd, "deploy", "linux", "mysql", "novaoffice_oa.sql"),
		filepath.Join(cwd, "..", "deploy", "linux", "mysql", "novaoffice_oa.sql"),
		filepath.Join(cwd, "..", "..", "deploy", "linux", "mysql", "novaoffice_oa.sql"),
	}

	for _, candidate := range candidates {
		full, err := filepath.Abs(candidate)
		if err != nil {
			continue
		}
		if _, err := os.Stat(full); err == nil {
			return full, nil
		}
	}

	return "", fmt.Errorf("cannot find SQL file, checked: %s", strings.Join(candidates, ", "))
}

func main() {
	host := getenv("MYSQL_HOST", "127.0.0.1")
	port := getenv("MYSQL_PORT", "3306")
	user := os.Getenv("MYSQL_USER")
	pass := os.Getenv("MYSQL_PASSWORD")
	dbName := getenv("MYSQL_DB", "novaoffice_oa")

	if user == "" {
		fmt.Fprintln(os.Stderr, "MYSQL_USER is required")
		os.Exit(1)
	}

	sqlFile, err := resolveSQLFile()
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	adminDSN := fmt.Sprintf("%s:%s@tcp(%s:%s)/?charset=utf8mb4&parseTime=true&loc=Local&multiStatements=true", user, pass, host, port)
	db, err := sql.Open("mysql", adminDSN)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	if _, err := db.Exec(fmt.Sprintf("CREATE DATABASE IF NOT EXISTS %s DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci", dbName)); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	file, err := os.Open(sqlFile)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	defer file.Close()

	targetDSN := fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?charset=utf8mb4&parseTime=true&loc=Local&multiStatements=true", user, pass, host, port, dbName)
	target, err := sql.Open("mysql", targetDSN)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	defer target.Close()

	if err := target.Ping(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	var builder strings.Builder
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := scanner.Text()
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "--") || trimmed == "" {
			continue
		}
		builder.WriteString(line)
		builder.WriteString("\n")
	}
	if err := scanner.Err(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	statements := strings.Split(builder.String(), ";\n")
	for _, stmt := range statements {
		query := strings.TrimSpace(stmt)
		if query == "" {
			continue
		}
		if _, err := target.Exec(query); err != nil {
			fmt.Fprintf(os.Stderr, "failed statement:\n%s\nerror: %v\n", query, err)
			os.Exit(1)
		}
	}

	fmt.Printf("mysql bootstrap ok: %s@%s:%s/%s\n", user, host, port, dbName)
}

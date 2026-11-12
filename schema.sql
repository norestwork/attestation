CREATE TABLE teachers (
                          id            SERIAL PRIMARY KEY,
                          full_name     TEXT    NOT NULL,
                          email         TEXT    NOT NULL UNIQUE,
                          password_hash TEXT    NOT NULL,
                          is_methodist  BOOLEAN NOT NULL DEFAULT FALSE,
                          attested_at   DATE,            -- дата присвоения категории
                          notified_at   DATE             -- когда последний раз отправляли предупреждение
);

CREATE TABLE criteria (
                          id    SERIAL PRIMARY KEY,
                          title TEXT NOT NULL UNIQUE
);

CREATE TABLE documents (
                           id           SERIAL PRIMARY KEY,
                           teacher_id   INT         NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
                           criterion_id INT         NOT NULL REFERENCES criteria(id),
                           description  TEXT        NOT NULL DEFAULT '',
                           filename     TEXT        NOT NULL,   -- имя файла, как его загрузил преподаватель
                           path         TEXT        NOT NULL,   -- путь к файлу в папке хранилища (относительный)
                           accepted     BOOLEAN     NOT NULL DEFAULT FALSE,  -- проверил методист
                           uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO criteria (title) VALUES
                                 ('Повышение квалификации'),
                                 ('Участие в методических объединениях'),
                                 ('Педагогическая разработка'),
                                 ('Публикации'),
                                 ('Выступления'),
                                 ('Инновационная деятельность'),
                                 ('Экспертная деятельность'),
                                 ('Профессиональные конкурсы'),
                                 ('Достижения учащихся'),
                                 ('Результаты освоения программ'),
                                 ('Консультативно-методическая деятельность');

-- Методист
INSERT INTO teachers (full_name, email, password_hash, is_methodist)
VALUES ('Швыркунова Ольга Юрьевна', 'o.shvyrkunova@mail.ru', '$2b$10$Wk1wDw79b0MLB1LX5YDn8ukxQdTc54NfhkybnJO5rotsA/ZHV8LGm', TRUE);

-- Сводка для методиста:
-- ФИО, готовность %, присвоение, окончание (+5 лет), дедлайн (окончание - 6 мес.)
CREATE VIEW summary AS
SELECT t.id,
       t.full_name,
       round(100.0 * count(DISTINCT d.criterion_id) FILTER (WHERE d.accepted)
             / (SELECT count(*) FROM criteria)) AS readiness_pct,
       t.attested_at,
       (t.attested_at + INTERVAL '5 years')::date                AS ends_at,
    (t.attested_at + INTERVAL '4 years 6 months')::date       AS deadline
FROM teachers t
         LEFT JOIN documents d ON d.teacher_id = t.id
WHERE NOT t.is_methodist
GROUP BY t.id;